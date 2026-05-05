import nodemailer from "nodemailer";

/**
 * THE MESSENGER: Sends automated emails for the ConsumAR Studio.
 */
export async function sendGoodbyeEmail(to: string, userName: string) {
  // 1. Configure the transporter
  // These should be in .env.local: EMAIL_SERVER, EMAIL_PORT, EMAIL_USER, EMAIL_PASS
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"ConsumAR Studio" <${process.env.EMAIL_USER || "noreply@tryitfirst.in"}>`,
    to: to,
    subject: "Your ConsumAR Studio Account was Successfully Deleted",
    text: `Hi ${userName || 'User'},\n\nThis is to confirm that your account and all associated 3D models have been permanently deleted from ConsumAR Studio as per your request.\n\nWe have wiped your data from our database and our file servers. If you decide to come back, you will need to sign up as a new user.\n\nGoodbye from the ConsumAR Team!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #4f46e5;">Goodbye from ConsumAR Studio</h2>
        <p>Hi ${userName || 'User'},</p>
        <p>This is to confirm that your account and all associated 3D models have been <strong>permanently deleted</strong> from ConsumAR Studio as per your request.</p>
        <p>We have wiped your data from our database and our file servers. If you decide to come back, you will need to sign up as a new user.</p>
        <p>Goodbye from the ConsumAR Team!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">If you did not request this deletion, please contact support immediately.</p>
      </div>
    `,
  };

  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("[email] SMTP credentials missing. Logging email instead:");
      console.log("[email] TO:", to);
      console.log("[email] SUBJECT:", mailOptions.subject);
      return { success: true, mocked: true };
    }

    await transporter.sendMail(mailOptions);
    console.log("[email] Goodbye email sent to:", to);
    return { success: true };
  } catch (error) {
    console.error("[email] Error sending email:", error);
    return { success: false, error };
  }
}
