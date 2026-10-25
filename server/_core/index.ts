import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { isIdentity, sendIdentityChat } from "../chatSend";
import { getOrchestrator } from "../orchestrator";
import { markTrialPaid, openTrial, validTrialId } from "../trial";
import { createCheckout, stripeSignatureOk } from "../pay";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.post("/api/stripe/webhook", (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const raw = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if (!secret || !raw || !stripeSignatureOk(raw, req.header("stripe-signature"), secret)) {
      res.status(400).json({ error: "firma rifiutata" });
      return;
    }
    const event = req.body;
    if (event?.type === "checkout.session.completed" && event.data?.object?.payment_status === "paid") {
      const trialId = event.data.object.client_reference_id;
      if (typeof trialId === "string") markTrialPaid(trialId);
    }
    res.json({ received: true });
  });

  // API usabile da fuori casa. Il token non si accetta mai vuoto.
  app.use("/api/v1", (req, res, next) => {
    const expected = process.env.DIB_API_TOKEN;
    const presented = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!expected || presented !== expected) {
      res.status(401).json({ error: "token rifiutato" });
      return;
    }
    next();
  });

  app.get("/api/v1/family", (_req, res) => {
    res.json({ members: getOrchestrator().roster() });
  });

  app.post("/api/v1/checkout", async (req, res) => {
    const trialId = typeof req.body?.trialId === "string" ? req.body.trialId : "";
    if (!validTrialId(trialId)) {
      res.status(400).json({ error: "identificativo prova non valido" });
      return;
    }
    const trial = openTrial(trialId);
    if (!trial.mustPay) {
      res.json({ url: "", trial });
      return;
    }
    try {
      res.json({ url: await createCheckout(trialId), trial });
    } catch (error: any) {
      res.status(503).json({ error: error.message, trial });
    }
  });

  app.post("/api/v1/trial", (req, res) => {
    const trialId = typeof req.body?.trialId === "string" ? req.body.trialId : "";
    if (!validTrialId(trialId)) {
      res.status(400).json({ error: "identificativo prova non valido" });
      return;
    }
    res.json(openTrial(trialId));
  });

  app.post("/api/v1/chat", async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const identity = typeof req.body?.identity === "string" ? req.body.identity : "";
    const trialId = typeof req.body?.trialId === "string" ? req.body.trialId : "";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!message || !isIdentity(identity) || !validTrialId(trialId)) {
      res.status(400).json({ error: "servono message, identity e trialId" });
      return;
    }
    const trial = openTrial(trialId);
    if (!trial.active) {
      res.status(403).json({
        error: "I 3 giorni di prova sono finiti. Per continuare bisogna pagare.",
        trial,
      });
      return;
    }
    try {
      const result = await sendIdentityChat({ message, identity, history });
      res.json({ ...result, trial });
    } catch (error: any) {
      res.status(502).json({ error: error.message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Cloud providers assign PORT dynamically; bind to it exactly.
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
