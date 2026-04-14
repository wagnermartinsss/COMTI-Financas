import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/send-invite", async (req, res) => {
    try {
      const { email, inviteId, ownerName, appUrl } = req.body;

      if (!email || !inviteId || !ownerName || !appUrl) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!process.env.RESEND_API_KEY) {
        console.warn("RESEND_API_KEY is not set. Skipping email send.");
        return res.status(500).json({ error: "Email service not configured" });
      }

      const inviteLink = `${appUrl}/invite/${inviteId}`;

      const fromEmail = process.env.RESEND_FROM_EMAIL || "COMTI Finanças <onboarding@resend.dev>";

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `${ownerName} convidou você para o COMTI Finanças`,
        html: `
          <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827; margin-bottom: 16px;">Olá!</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              <strong>${ownerName}</strong> convidou você para compartilhar o controle financeiro no <strong>COMTI Finanças</strong>.
            </p>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
              Ao aceitar, vocês poderão visualizar e gerenciar as mesmas transações, categorias e saldos em conjunto.
            </p>
            <a href="${inviteLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              Aceitar Convite
            </a>
            <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
              Se você não conhece ${ownerName}, pode ignorar este e-mail.
            </p>
          </div>
        `,
      });

      if (error) {
        console.error("Resend error:", JSON.stringify(error, null, 2));
        return res.status(400).json({ error });
      }

      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
