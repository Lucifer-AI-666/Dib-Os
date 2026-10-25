import crypto from "node:crypto";
import { DIB_PRICE_CENTS, DIB_PRICE_CURRENCY } from "../shared/price";

/** Crea una sessione Stripe Checkout. Un pagamento sblocca la chat di quel trial. */
export async function createCheckout(trialId: string): Promise<string> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  const appUrl = (process.env.PUBLIC_APP_URL ?? "http://localhost:8081").replace(/\/$/, "");
  if (!secret) {
    throw new Error("manca STRIPE_SECRET_KEY");
  }

  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    ...(price
      ? { "line_items[0][price]": price }
      : {
          "line_items[0][price_data][currency]": DIB_PRICE_CURRENCY,
          "line_items[0][price_data][unit_amount]": String(DIB_PRICE_CENTS),
          "line_items[0][price_data][product_data][name]": "Dib'OS",
        }),
    success_url: `${appUrl}/?pagamento=ok`,
    cancel_url: `${appUrl}/?pagamento=annullato`,
    client_reference_id: trialId,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json();
  if (!response.ok || typeof data.url !== "string") {
    throw new Error("Stripe non ha aperto il pagamento");
  }
  return data.url;
}

/** Verifica la firma Stripe sul corpo originale. */
export function stripeSignatureOk(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [key, value] = p.trim().split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
