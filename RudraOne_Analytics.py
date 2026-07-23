import os
import json
from typing import List, Dict, Any
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Load environment variables
load_dotenv()

# 1. Mock Data Creation
# Simulating a database of 112 calls (Indian Emergency Number)
MOCK_CALLS_DATA = [
    {"id": "C001", "timestamp": "2023-10-27T08:30:00", "type": "Medical", "subtype": "Cardiac Arrest", "priority": "High", "location": "Flat 402, Krishna Heights, Andheri West, Mumbai", "status": "Closed", "response_time_min": 15},
    {"id": "C002", "timestamp": "2023-10-27T09:15:00", "type": "Fire", "subtype": "Structure Fire", "priority": "Critical", "location": "Shop No 5, Main Market, Karol Bagh, New Delhi", "status": "Active", "response_time_min": 12},
    {"id": "C003", "timestamp": "2023-10-27T09:45:00", "type": "Police", "subtype": "Suspicious Activity", "priority": "Medium", "location": "Near Metro Station, Indiranagar, Bengaluru", "status": "Closed", "response_time_min": 20},
    {"id": "C004", "timestamp": "2023-10-27T10:20:00", "type": "Medical", "subtype": "Road Accident", "priority": "Critical", "location": "Outer Ring Road, Hyderabad", "status": "Active", "response_time_min": 10},
    {"id": "C005", "timestamp": "2023-10-27T11:00:00", "type": "Police", "subtype": "Theft", "priority": "Medium", "location": "Sector 17 Market, Chandigarh", "status": "Closed", "response_time_min": 25},
    {"id": "C006", "timestamp": "2023-10-27T11:30:00", "type": "Fire", "subtype": "Gas Leak", "priority": "High", "location": "Industrial Area Phase 1, Pune", "status": "Closed", "response_time_min": 18},
    {"id": "C007", "timestamp": "2023-10-27T12:15:00", "type": "Medical", "subtype": "Breathing Difficulty", "priority": "High", "location": "Salt Lake City, Sector V, Kolkata", "status": "Closed", "response_time_min": 14},
    {"id": "C008", "timestamp": "2023-10-27T13:00:00", "type": "Police", "subtype": "Noise Complaint", "priority": "Low", "location": "Bandra Bandstand, Mumbai", "status": "Closed", "response_time_min": 45},
    {"id": "C009", "timestamp": "2023-10-27T14:45:00", "type": "Medical", "subtype": "Food Poisoning", "priority": "Medium", "location": "Connaught Place, New Delhi", "status": "Closed", "response_time_min": 22},
    {"id": "C010", "timestamp": "2023-10-27T15:30:00", "type": "Police", "subtype": "Domestic Disturbance", "priority": "High", "location": "Anna Nagar, Chennai", "status": "Active", "response_time_min": 15},
    {"id": "C011", "timestamp": "2023-10-27T16:15:00", "type": "Medical", "subtype": "High Fever", "priority": "Low", "location": "Civil Lines, Jaipur", "status": "Closed", "response_time_min": 30},
    {"id": "C012", "timestamp": "2023-10-27T17:00:00", "type": "Fire", "subtype": "Short Circuit", "priority": "Medium", "location": "Tech Park, Electronic City, Bengaluru", "status": "Active", "response_time_min": 16},
    {"id": "C013", "timestamp": "2023-10-27T17:45:00", "type": "Police", "subtype": "Cyber Crime", "priority": "Medium", "location": "Cyber City, Gurugram", "status": "Active", "response_time_min": 0},
    {"id": "C014", "timestamp": "2023-10-27T18:10:00", "type": "Medical", "subtype": "Pregnancy Labor", "priority": "High", "location": "Koramangala, Bengaluru", "status": "Active", "response_time_min": 8},
    {"id": "C015", "timestamp": "2023-10-27T18:30:00", "type": "Fire", "subtype": "Trash Fire", "priority": "Low", "location": "Dharavi, Mumbai", "status": "Closed", "response_time_min": 25},
    {"id": "C016", "timestamp": "2023-10-27T19:00:00", "type": "Police", "subtype": "Missing Person", "priority": "Medium", "location": "Juhu Beach, Mumbai", "status": "Active", "response_time_min": 0},
    {"id": "C017", "timestamp": "2023-10-27T19:45:00", "type": "Medical", "subtype": "Snake Bite", "priority": "Critical", "location": "Farmhouse, outskirts of Pune", "status": "Active", "response_time_min": 25},
    {"id": "C018", "timestamp": "2023-10-27T20:15:00", "type": "Police", "subtype": "Vandalism", "priority": "Low", "location": "Public Park, Mysore", "status": "Closed", "response_time_min": 40},
]

MOCK_UNITS_DATA = [
    {"unit_id": "AMB-MUM-01", "type": "Ambulance", "status": "Busy", "location": "Andheri West, Mumbai", "assigned_call": "C001"},
    {"unit_id": "AMB-MUM-02", "type": "Ambulance", "status": "Available", "location": "Dadar, Mumbai", "assigned_call": None},
    {"unit_id": "FIR-DEL-01", "type": "Fire Truck", "status": "Busy", "location": "Karol Bagh, New Delhi", "assigned_call": "C002"},
    {"unit_id": "PCR-BLR-01", "type": "Police Car", "status": "Patrolling", "location": "Indiranagar, Bengaluru", "assigned_call": None},
    {"unit_id": "PCR-HYD-01", "type": "Police Car", "status": "Busy", "location": "Outer Ring Road, Hyderabad", "assigned_call": "C004"},
    {"unit_id": "AMB-CHE-01", "type": "Ambulance", "status": "Available", "location": "Anna Nagar, Chennai", "assigned_call": None},
    {"unit_id": "FIR-PUN-01", "type": "Fire Truck", "status": "Maintenance", "location": "Pune Fire Station", "assigned_call": None},
    {"unit_id": "PCR-MUM-03", "type": "Police Car", "status": "Available", "location": "Colaba, Mumbai", "assigned_call": None},
]

MOCK_STATIONS_DATA = [
    {"station_id": "ST-MUM-01", "name": "Mumbai Central Fire Station", "type": "Fire", "city": "Mumbai", "active_units": 5, "total_units": 8},
    {"station_id": "ST-DEL-01", "name": "AIIMS Trauma Center", "type": "Medical", "city": "New Delhi", "active_units": 12, "total_units": 15},
    {"station_id": "ST-BLR-01", "name": "Bengaluru City Police HQ", "type": "Police", "city": "Bengaluru", "active_units": 20, "total_units": 25},
    {"station_id": "ST-HYD-01", "name": "Hyderabad Fire & Safety", "type": "Fire", "city": "Hyderabad", "active_units": 4, "total_units": 6},
    {"station_id": "ST-CHE-01", "name": "Apollo Hospital Greams Road", "type": "Medical", "city": "Chennai", "active_units": 8, "total_units": 10},
]

MOCK_HOURLY_STATS = [
    {"hour": 0, "avg_volume": 12, "busiest_day": "Saturday"},
    {"hour": 1, "avg_volume": 8, "busiest_day": "Sunday"},
    {"hour": 2, "avg_volume": 5, "busiest_day": "Sunday"},
    {"hour": 3, "avg_volume": 4, "busiest_day": "Saturday"},
    {"hour": 4, "avg_volume": 3, "busiest_day": "Monday"},
    {"hour": 5, "avg_volume": 6, "busiest_day": "Monday"},
    {"hour": 6, "avg_volume": 15, "busiest_day": "Monday"},
    {"hour": 7, "avg_volume": 35, "busiest_day": "Monday"},
    {"hour": 8, "avg_volume": 65, "busiest_day": "Monday"},
    {"hour": 9, "avg_volume": 80, "busiest_day": "Tuesday"},
    {"hour": 10, "avg_volume": 75, "busiest_day": "Wednesday"},
    {"hour": 11, "avg_volume": 70, "busiest_day": "Friday"},
    {"hour": 12, "avg_volume": 65, "busiest_day": "Friday"},
    {"hour": 13, "avg_volume": 60, "busiest_day": "Friday"},
    {"hour": 14, "avg_volume": 55, "busiest_day": "Thursday"},
    {"hour": 15, "avg_volume": 65, "busiest_day": "Friday"},
    {"hour": 16, "avg_volume": 85, "busiest_day": "Friday"},
    {"hour": 17, "avg_volume": 95, "busiest_day": "Friday"},
    {"hour": 18, "avg_volume": 110, "busiest_day": "Saturday"},
    {"hour": 19, "avg_volume": 105, "busiest_day": "Saturday"},
    {"hour": 20, "avg_volume": 90, "busiest_day": "Saturday"},
    {"hour": 21, "avg_volume": 75, "busiest_day": "Sunday"},
    {"hour": 22, "avg_volume": 50, "busiest_day": "Sunday"},
    {"hour": 23, "avg_volume": 30, "busiest_day": "Saturday"},
]

MOCK_MONTHLY_INCIDENTS = [
    {"month": "Jan", "medical": 450, "fire": 120, "police": 310},
    {"month": "Feb", "medical": 420, "fire": 110, "police": 290},
    {"month": "Mar", "medical": 480, "fire": 140, "police": 330},
    {"month": "Apr", "medical": 510, "fire": 160, "police": 350},
    {"month": "May", "medical": 550, "fire": 200, "police": 380},
    {"month": "Jun", "medical": 530, "fire": 180, "police": 360},
    {"month": "Jul", "medical": 500, "fire": 150, "police": 340},
    {"month": "Aug", "medical": 520, "fire": 140, "police": 350},
    {"month": "Sep", "medical": 540, "fire": 130, "police": 370},
    {"month": "Oct", "medical": 580, "fire": 190, "police": 400},
    {"month": "Nov", "medical": 600, "fire": 250, "police": 420},
    {"month": "Dec", "medical": 620, "fire": 180, "police": 450},
]

class RudraAnalyst:
    def __init__(self):
        # Initialize LLM - attempting to use OpenAI as per existing project structure
        # Fallback to a mock if API key is missing for demonstration purposes
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("Warning: OPENAI_API_KEY not found. The RAG system will not function fully.")
            self.llm = None
        else:
            # Using gpt-4o for better code generation capabilities
            self.llm = ChatOpenAI(model="gpt-4o", temperature=0)

    def query_data(self, user_query: str) -> str:
        """
        Simple RAG: Answers questions based on the mock data.
        """
        if not self.llm:
            return "LLM not initialized. Cannot answer query."

        # Context injection (Simple RAG for small dataset)
        full_data = {
            "calls": MOCK_CALLS_DATA,
            "units": MOCK_UNITS_DATA,
            "stations": MOCK_STATIONS_DATA,
            "hourly_stats": MOCK_HOURLY_STATS,
            "monthly_trends": MOCK_MONTHLY_INCIDENTS
        }
        data_context = json.dumps(full_data, indent=2)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are RudraOne Analytics, an expert data analyst for a 112 dispatch center in India. You have access to the following data: {data}. Answer the user's question based ONLY on this data. Be concise and professional."),
            ("user", "{question}")
        ])
        
        chain = prompt | self.llm | StrOutputParser()
        
        return chain.invoke({"data": data_context, "question": user_query})

    def generate_visual_artifact(self, user_query: str, output_file: str = "rudra_analysis.html") -> str:
        """
        Generates an HTML file with Chart.js visualizations based on the data and query.
        Returns the HTML content as a string.
        """
        if not self.llm:
            return "LLM not initialized. Cannot generate artifact."

        full_data = {
            "calls": MOCK_CALLS_DATA,
            "units": MOCK_UNITS_DATA,
            "stations": MOCK_STATIONS_DATA,
            "hourly_stats": MOCK_HOURLY_STATS,
            "monthly_trends": MOCK_MONTHLY_INCIDENTS
        }
        data_context = json.dumps(full_data, indent=2)

        # Prompt to generate HTML/JS
        system_prompt = """
        You are RudraOne Analytics, a frontend developer and data analyst building a dashboard for RudraOne (India's Emergency Response System).
        Your task is to create a single-file HTML dashboard that visualizes the provided 112 call data, unit status, station information, hourly stats, and monthly trends.
        
        The user will ask for a specific analysis or visualization.
        
        Requirements:
        1. Output ONLY valid HTML code. Do not include markdown backticks (```html).
        2. Use Chart.js (via CDN) for visualizations.
        3. Use Tailwind CSS (via CDN) for styling.
        4. Embed the provided data directly into the JavaScript variable `const rudraData = ...`.
        5. Create a modern, clean UI with a dark mode theme.
           - IMPORTANT: Use background color #0f1117 (to match the main app).
           - Text color should be slate-300 or white.
           - Cards should use bg-[#1e293b] and border-gray-700.
        6. Include a header "RudraOne Analytics (112 India)".
        7. Include summary cards (Total Calls, Avg Response Time, Active Units, etc.) at the top.
        8. DYNAMIC UI GENERATION:
           - Choose the BEST visualization for the data:
             * Trends over time -> Line Charts
             * Categorical comparisons -> Bar Charts
             * Proportions -> Doughnut/Pie Charts
             * Multi-variable metrics -> Radar Charts
           - If the user asks for lists, tables, or details:
             * Generate a responsive HTML Table.
             * Use `w-full text-left border-collapse`.
             * Headers: `bg-gray-800 text-gray-400 uppercase text-xs font-semibold p-4`.
             * Rows: `border-b border-gray-700 hover:bg-gray-800/50 transition-colors`.
             * Cells: `p-4 text-sm text-gray-300`.
             * Use Status Badges: `px-2 py-1 rounded-full text-xs font-medium` (Green for Active/Available, Red for Critical/Busy, Gray for Closed).
             * Wrap the table in a `div` with `overflow-x-auto` to prevent layout breakage.
           - If the user asks for status/availability, use Grid Cards with color-coded indicators (Green=Available, Red=Busy).
           - Use Lucide Icons (via unpkg CDN) to enhance the UI.
        9. Ensure the HTML is self-contained (no external CSS/JS files other than CDNs).
        10. Remove all default body margins/padding so it fits seamlessly.
        11. DO NOT use `h-screen` or fixed heights on the body/main container. Let the content define the height so it can be embedded properly.
        
        Data:
        {data}
        """

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("user", "Create a visual analysis dashboard for: {question}")
        ])

        chain = prompt | self.llm | StrOutputParser()
        
        print(f"Generating visual artifact for: '{user_query}'...")
        html_content = chain.invoke({"data": data_context, "question": user_query})
        
        # Clean up potential markdown formatting if the LLM ignores instructions
        html_content = html_content.replace("```html", "").replace("```", "")
        
        return html_content

    def chat(self, user_message: str) -> Dict[str, str]:
        """
        Decides whether to generate a text answer or a visual artifact based on the user's message.
        """
        if not self.llm:
             return {"type": "text", "content": "LLM not initialized. Please check your API key."}

        # Simple intent classification
        intent_prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant. Determine if the user wants a visual representation (chart, graph, dashboard, table, list, grid) or just a simple text answer. Respond with 'VISUAL' if they want any kind of UI element, otherwise 'TEXT'."),
            ("user", "{message}")
        ])
        intent_chain = intent_prompt | self.llm | StrOutputParser()
        intent = intent_chain.invoke({"message": user_message}).strip().upper()
        
        # Expanded keywords to catch more visual requests
        visual_keywords = ["CHART", "GRAPH", "DASHBOARD", "TABLE", "GRID", "MAP", "VISUAL", "PLOT", "TREND", "LIST"]
        if "VISUAL" in intent or any(keyword in user_message.upper() for keyword in visual_keywords):
            html_content = self.generate_visual_artifact(user_message)
            return {"type": "html", "content": html_content}
        else:
            text_answer = self.query_data(user_message)
            return {"type": "text", "content": text_answer}


def main():
    analyst = RudraAnalyst()
    
    print("Initializing RudraOne Analyst...")
    
    # Example 1: Text Query
    question = "What is the average response time for Medical calls?"
    print(f"\n--- Text Query: {question} ---")
    try:
        answer = analyst.query_data(question)
        print(f"Answer: {answer}")
    except Exception as e:
        print(f"Error: {e}")

    # Example 2: Visual Artifact Generation
    viz_request = "Show me the distribution of call types (Pie Chart) and a bar chart of response times by priority."
    print(f"\n--- Visual Request: {viz_request} ---")
    try:
        result = analyst.generate_visual_artifact(viz_request)
        print(result)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
