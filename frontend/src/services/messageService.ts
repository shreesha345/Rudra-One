// Message Service for SMS tracking
export interface MessageContact {
  number: string;
  timestamp: string;
  linkSent: boolean;
}

class MessageService {
  private messages: Map<string, MessageContact> = new Map();

  constructor() {
    // Pre-load test contact
    this.addContact('+917795075436');
  }

  // Add a new message contact
  addContact(number: string): void {
    if (!this.messages.has(number)) {
      this.messages.set(number, {
        number,
        timestamp: new Date().toISOString(),
        linkSent: false
      });
    }
  }

  // Send tracking link to a number
  sendTrackingLink(number: string): Promise<boolean> {
    return new Promise((resolve) => {
      const contact = this.messages.get(number);
      if (contact) {
        contact.linkSent = true;
        this.messages.set(number, contact);
        
        // Simulate sending SMS
        setTimeout(() => {
          console.log(`Tracking link sent to ${number}`);
          resolve(true);
        }, 500);
      } else {
        resolve(false);
      }
    });
  }

  // Get all messages
  getAllMessages(): MessageContact[] {
    return Array.from(this.messages.values());
  }

  // Get message by number
  getMessageByNumber(number: string): MessageContact | undefined {
    return this.messages.get(number);
  }

  // Check if link was sent
  wasLinkSent(number: string): boolean {
    const contact = this.messages.get(number);
    return contact?.linkSent || false;
  }

  // Clear all messages
  clearMessages(): void {
    this.messages.clear();
  }
}

export const messageService = new MessageService();
export default messageService;
