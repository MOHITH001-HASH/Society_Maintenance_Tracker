import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";

export const sendNotification = async (type: 'email' | 'sms', to: string | string[], subject: string, message: string) => {
  console.log(`[MOCK NOTIFICATION] Sending ${type.toUpperCase()} to ${to}...`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${message}`);
  
  if (type === 'email') {
    try {
      // Create a document in 'mail' collection to trigger Firebase Extension 'Trigger Email'
      await addDoc(collection(db, "mail"), {
        to: Array.isArray(to) ? to : [to],
        message: {
          subject,
          text: message,
          html: `<p>${message.replace(/\n/g, '<br/>')}</p>`
        },
        createdAt: new Date().toISOString()
      });
      console.log(`[EMAIL EXTENSION] Triggered email to ${to}`);
      
      await addDoc(collection(db, "auditLogs"), {
         action: "Email Notification Sent",
         description: `To: ${Array.isArray(to) ? to.join(', ') : to} | Subject: ${subject}`,
         timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to write to mail collection:", err);
    }
  }

  // Show a browser alert to visibly demonstrate the mock notification (only for single recipients to avoid spam)
  // Alert removed to prevent iframe blocking/sandbox issues
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log(`[MOCK NOTIFICATION] Delivered successfully.`);
};
