# How I Turned an AI Emergency Dispatcher Into a Glass Box With SigNoz

*A 15,000-line voice AI system that triages emergency calls in 12 Indian languages had a secret: nobody — including me — could see what it was actually doing. OpenTelemetry and SigNoz changed that.*

---

On the worst day of testing, RudraOne held a simulated caller in silence for fourteen seconds.

Nothing crashed. No error was logged. The HTTP status code was 200. If you looked at the server metrics, everything looked fine. But on the other end of that call was a person who needed help, and fourteen seconds of dead air in an emergency is an eternity.

I didn't find the bug by looking at logs. I found it because a dispatcher on the frontend team said, "It felt slow today." That was the extent of my observability. A human feeling.

I spent the next three weeks integrating SigNoz and OpenTelemetry into every layer of RudraOne. What I learned changed how I think about building AI systems — not just voice agents, but anything where a model makes decisions that matter.

This is the story of that shift.

---

## The Problem No One Prepares You For

Emergency dispatch in India is a bandwidth problem.

A single 112 call center operator might handle five calls simultaneously. Each caller speaks a different language. Each emergency is different — cardiac arrest, house fire, car accident, domestic violence. Each requires immediate triage and a calm, authoritative voice on the other end.

RudraOne was built to handle the first five minutes of every call. Triage the emergency. Collect the location. Calm the caller. Then hand off to a human dispatcher with full context already gathered.

The stack is real. Twilio routes the phone calls. Deepgram transcribes speech in real-time. An LLM triages the emergency using a custom protocol. ElevenLabs and Sarvam AI generate natural-sounding responses in the caller's language. A React frontend lets human dispatchers monitor everything — live transcripts, caller locations on a map, AI-generated incident summaries.

About 15,000 lines of code. Twelve API integrations. A real-time WebSocket pipeline that handles audio encoding, transcription, translation, and AI response generation simultaneously.

And until three weeks ago, I had no idea what was happening inside any of it.

---

## Three Failure Modes That Traditional Monitoring Can't See

Here's what I mean when I say the system was a black box.

**Silent degradation.** The LLM returns a response that is grammatically correct, contextually relevant, and completely wrong. It misreads the caller's urgency level. It sends a location request when the caller already gave their address verbally. There's no error in the logs. No exception in the traceback. The AI is just wrong, and you won't discover it until the ambulance shows up at the wrong house.

To debug this, you need the full conversation history, the exact prompt that went to the model, the response that came back, and the timing of the entire exchange. Traditional APM tools tell you the HTTP request succeeded. They don't tell you the AI said the wrong thing.

**Latency variance.** On a normal call, RudraOne responds in about 800 milliseconds. But when the conversation gets long and the context window fills up, response times spike to fourteen seconds. In an emergency call, that's terrifying. The caller thinks the system crashed. They hang up. They call back. They get routed to a different AI instance. Nobody knows what happened to the first call.

I only discovered this because a user complained. I had no automated way to detect it.

**Token budget exhaustion.** LLM APIs charge per token. When a training session goes wrong and the AI gets stuck in a loop, it can burn through 50,000 tokens in two minutes. At scale — thousands of concurrent calls — that's a real budget problem. You need to know which calls are expensive and why.

These three failure modes share a common thread: they're invisible to the tools most teams reach for first. Uptime monitors don't catch them. Log aggregators don't correlate them. Dashboard widgets built from Prometheus metrics don't surface the root cause.

You need traces. You need logs correlated to those traces. And you need a way to query your trace data with the same fluency you'd query a database.

That's what led me to SigNoz.

---

## Why SigNoz, Specifically

I evaluated three alternatives before choosing SigNoz. Each had a dealbreaker.

**Datadog** has a polished UI and excellent onboarding. But it's a SaaS product with per-host pricing, per-seat costs, and ingestion fees for logs and traces. For a hackathon project that might run on a single laptop with no internet connection, that's a non-starter.

**Jaeger** is free and open-source, and it does distributed tracing well. But it only does traces. I'd need Prometheus for metrics and Loki for logs, and then Grafana to stitch them together. That's three systems to maintain, three configurations to manage, three UIs to check when something goes wrong.

**Grafana Tempo** was in the running too. Same limitation — traces only, still need the Loki + Prometheus stack.

SigNoz solved the problem differently. Traces, logs, and metrics in a single platform. Self-hosted on Docker Compose. ClickHouse as the storage backend, which means I can write actual SQL queries against my trace data. Free. And it speaks OpenTelemetry natively, so there are no proprietary agents to install.

The ClickHouse backend was the deciding factor. I could write a query like "show me the average LLM token usage grouped by call duration" and get an answer in under a second. With Datadog's proprietary query language, that same question would take twenty minutes of menu navigation and cost me money.

---

## The Architecture, Simplified

> 📸 Insert Architecture Diagram Here

RudraOne runs ten Docker containers. Four for the application — PostgreSQL, a FastAPI backend, a React frontend, and a Cloudflare tunnel for external access. Six for SigNoz — the UI, an OTel collector, ClickHouse, ClickHouse Keeper, a PostgreSQL metastore, and a schema migrator.

The data flow is straightforward. The FastAPI backend has OpenTelemetry auto-instrumentation for HTTP routes, database queries, and outgoing HTTP requests. Every trace exports via OTLP/gRPC to the SigNoz collector on port 4317. The React frontend has its own OTel setup that traces fetch calls and user interactions, exporting via OTLP/HTTP to port 4318.

The collector writes everything to ClickHouse. SigNoz's query service reads from ClickHouse and serves the dashboard. That's the entire observability pipeline.

But the piece I'm most proud of is the auto-seeding. When the backend starts for the first time, it connects directly to SigNoz's internal PostgreSQL database, creates a service account, generates an API key, and inserts a pre-built dashboard with eight panels. No manual setup. No "import this JSON file." The dashboard exists the moment the application starts.

---

## How the Backend Integration Works

The backend integration lives in a single file: `backend/telemetry.py`. When the FastAPI app boots, it initializes three layers: a tracer provider, a meter provider, and log correlation.

The tracer provider supports both gRPC and HTTP exporters. I chose gRPC because SigNoz's collector supports it natively and it's faster for the volume of spans a real-time voice system generates. The meter provider exports custom metrics every 60 seconds. And the log instrumentation injects trace IDs into every Python log line, so clicking a trace in SigNoz shows the exact logs for that request.

The real value comes from four auto-instrumentors:

```python
FastAPIInstrumentor.instrument_app(app)
SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
AsyncPGInstrumentor().instrument()
HTTPXClientInstrumentor().instrument()
```

Four lines of code. They gave me HTTP route tracing, database query tracing, async PostgreSQL driver tracing, and outgoing HTTP request tracing. Every Twilio webhook, every Deepgram transcription request, every LLM API call, every database query — all of it appears as spans in SigNoz without any additional code.

But the most valuable instrumentation is the custom LLM span. I wrapped every call to the LLM in a span named `llm.chat_completion` that captures the model name, prompt message count, whether tools were available, and — critically — token usage:

```python
with tracer.start_as_current_span("llm.chat_completion") as span:
    span.set_attribute("llm.model", target_model)
    span.set_attribute("llm.prompt_message_count", len(messages))
    response = client.chat.completions.create(...)
    if response.usage:
        span.set_attribute("llm.usage.prompt_tokens", response.usage.prompt_tokens)
        span.set_attribute("llm.usage.completion_tokens", response.usage.completion_tokens)
        span.set_attribute("llm.usage.total_tokens", response.usage.total_tokens)
```

That data feeds directly into the SigNoz dashboard. I can track AI costs in real-time, see which calls are expensive, and understand why.

---

## The Frontend Side

The frontend integration is about thirty lines of TypeScript in `frontend/src/telemetry.ts`. It creates a `WebTracerProvider`, attaches an OTLP trace exporter, and registers three instrumentations: fetch, XMLHttpRequest, and user interaction.

The user interaction instrumentation is the one that surprised me with its value. Every button click on the dispatcher dashboard becomes a span. When someone clicks the "Send Emergency SMS" button, I can see exactly when they clicked it, how long the API call took, and whether it succeeded. All correlated with the backend trace via W3C `traceparent` headers.

I spent two hours debugging CORS issues to get this working. The browser needs to send `traceparent` headers with cross-origin requests, and by default, FastAPI's CORS middleware strips unknown headers. A tiny configuration change, but without it, the frontend traces were disconnected from the backend — useless for debugging the full request lifecycle.

---

## Log Correlation Changed Everything

Before SigNoz, my logs were text files. Lots of them. Scattered across the backend, tagged with timestamps but nothing else. When something went wrong, I'd grep for the call ID, find three or four related log entries spread across different files, and try to reconstruct what happened.

After adding log correlation, every Python log line includes an `otelTraceID` and `otelSpanID`. In SigNoz, I can click any trace and see all logs emitted during that request. I can click any log line and jump to the full trace.

This sounds like a small thing. It isn't.

On day two of having SigNoz running, I found a bug in the language detection logic. The AI was defaulting to English for Tamil callers because the character-range heuristic in `detect_language_from_text()` was too narrow. The latency was fine. The error rate was zero. The AI was just... wrong. And I could only see it was wrong because I could read the exact prompt and response in the trace.

You can't fix what you can't see. That's the fundamental value proposition of observability for AI systems.

---

## The Dashboard: Eight Panels, Real Answers

> 📸 Insert SigNoz Dashboard Screenshot Here

The auto-seeded dashboard has eight panels, each answering a specific operational question.

The top row has four value widgets. Total request count tells me how much traffic the system is handling. Error count tells me how many requests failed. Average latency tells me whether the system is responding quickly enough. Total LLM tokens consumed tells me what the AI is costing in real-time.

The middle row has three time-series graphs. Latency over time shows me whether response times are degrading as conversations get longer. Request rate over time shows traffic patterns. Token usage over time — broken down by prompt, completion, and total tokens — shows me the cost trajectory.

> 📸 Insert Token Usage Dashboard Here

The bottom row is a table showing the top endpoints sorted by request count, with average latency and error count. This is where I go first when something feels slow. It immediately shows which endpoints are the bottleneck.

Every query in that dashboard is ClickHouse SQL. The token usage query, for example:

```sql
SELECT
  toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time,
  sum(attributes_number['llm.usage.prompt_tokens']) as prompt,
  sum(attributes_number['llm.usage.completion_tokens']) as completion,
  sum(attributes_number['llm.usage.total_tokens']) as total
FROM signoz_traces.distributed_signoz_index_v3
WHERE serviceName = 'rudraone-backend'
  AND mapContains(attributes_number, 'llm.usage.total_tokens')
GROUP BY time ORDER BY time ASC
```

When there's a spike in prompt tokens but not completion tokens, it means callers are having long conversations but the AI is giving short responses. That's useful for tuning the system prompt.

---

## Before SigNoz vs. After

The comparison is stark.

**Before:** Debugging was an archaeological expedition. A user would report "the AI said something weird on call X" and I'd spend forty-five minutes grepping through log files trying to reconstruct what happened. I'd find the Twilio webhook log, but it wouldn't have the transcript. I'd find the Deepgram transcription log, but it wouldn't have the LLM response. Each log entry was an island.

**After:** I open SigNoz, filter by time range, click on the call's trace, and see everything. The HTTP request from Twilio. The Deepgram transcription span. The LLM call span with token counts. The TTS generation span. The audio streaming span. All connected in one timeline. If I need to see a specific log message during any of those spans, I click the "Logs" tab and it's right there.

> 📸 Insert Trace Waterfall Screenshot Here

> 📸 Insert Trace-to-Logs Screenshot Here

**Before:** I had no idea how many tokens the AI was consuming. No idea which calls were expensive. No idea why some calls took longer than others. I was flying blind.

**After:** I can see exactly how my AI costs scale over time. I can identify which endpoints are slow. I can trace every user interaction on the frontend to its backend consequence. I can see the full span tree for any request.

The difference is the difference between flying blind and having instruments.

---

## Lessons I Learned the Hard Way

**Auto-instrumentation gets you 80% there.** The Python OTel libraries for FastAPI, SQLAlchemy, and HTTPX are excellent. Install them, call `instrument()`, and you immediately have tracing for HTTP and database operations. The remaining 20% — LLM spans, log correlation, frontend traces — requires manual work, but it builds on the same foundation. Don't try to instrument everything manually first. Let auto-instrumentation do the heavy lifting.

**ClickHouse is the real differentiator.** Being able to write SQL against your trace data is powerful in a way that's hard to appreciate until you've tried it. I built a query that shows average token usage per call, grouped by call duration. Turns out calls longer than five minutes use three times more tokens per minute than shorter calls, because the AI's system prompt keeps growing with conversation history. That insight led me to implement context pruning, which reduced token costs by 40%. I would never have found that without ClickHouse SQL.

**Frontend tracing is equally important.** Before adding `WebTracerProvider`, the browser was a black box. Now I can see which API calls the frontend makes, how long they take, and which user interactions trigger them. I discovered that the "Extract Insights" button was making three redundant API calls because of a race condition in React state management. Fixed it in twenty minutes. That race condition was costing real tokens on every insight extraction.

**Observability should be designed early.** I added SigNoz after the system was already built. If I'd instrumented from day one, I would have caught the language detection bug, the latency variance issue, and the frontend race condition much sooner. The auto-instrumentors make this easy. There's no excuse for not doing it from the start.

**AI systems require different debugging strategies.** Traditional applications fail loudly — exceptions, 500 errors, timeout errors. AI agents fail silently. The model returns a plausible, well-formed, completely incorrect response. The only way to catch these failures is to see the full prompt-response chain in context. That's what traces provide.

---

## What I'm Still Figuring Out

I haven't set up alerting yet. SigNoz supports it, and I know I need alerts for latency spikes and error rate increases. But I'm not sure what the right thresholds are for an emergency system. What's an acceptable P99 latency for an AI triage response? Two seconds? 500 milliseconds? I don't know yet, and I don't want to set arbitrary thresholds that trigger false alarms.

I also want to enable SigNoz's MCP server so the AI agent itself can query its own observability data. The idea is simple: the AI notices it's been responding slowly on calls with Hindi speakers, so it automatically adjusts its system prompt to be more concise for Hindi translations. That's the long-term vision. The infrastructure is there. The implementation isn't.

And cost attribution. Right now I can see total token usage, but I can't attribute it to individual callers or call types. I want to know which emergency category — medical, fire, police — is most expensive to handle. That data exists in the traces. I just need to build the dashboard for it.

---

## If You're Building AI Agents

AI agents don't become production systems because they answer correctly. They become production systems because engineers can understand every decision they make.

That's what observability provides. Not monitoring. Not logging. Observability — the ability to ask arbitrary questions about your system's behavior and get answers from the data it produces.

RudraOne handles emergency calls. The stakes are as high as they get. But the principle applies to any AI agent: a customer support bot, a code review assistant, a medical triage system. If a model is making decisions that affect people, you need to see inside those decisions.

SigNoz made that possible for RudraOne. The dashboard auto-seeds on first boot. The setup takes about fifteen minutes. The stack runs on Docker Compose with no internet connection required. And the ClickHouse backend means you can query your trace data with SQL you already know.

The question isn't whether you can afford to add observability to your AI system. The question is whether you can afford not to.

---

**Built with:** SigNoz for observability, OpenTelemetry for instrumentation, FastAPI for the backend, React and Vite for the frontend, Deepgram for speech-to-text, ElevenLabs and Sarvam AI for text-to-speech, Twilio for the phone system, and ClickHouse for trace storage.

*This post is part of the SigNoz Hackathon. The full source code is available on GitHub.*
