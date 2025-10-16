import express from "express";
import { Client, middleware } from "@line/bot-sdk";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// --- CORS ---
app.use(cors({
  origin: 'https://customer-app-restuarant-application.onrender.com/',
}));

// --- LINE Bot config ---
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);

// --- Supabase ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// --- ✅ ใช้ raw body เฉพาะ webhook เท่านั้น ---
app.post("/webhook",
  express.raw({ type: "application/json" }),
  middleware(config),
  async (req, res) => {
    try {
      const body = req.body;
      const events = body.events;

      console.log("Received events:", JSON.stringify(events, null, 2));

      if (!events || events.length === 0) {
        return res.status(200).end();
      }

      for (const event of events) {
        if (event.type === "message" && event.message.type === "text") {
          const userText = event.message.text.trim();
          const userId = event.source.userId;

          if (userText === "สั่งอาหาร") {
            const { data, error } = await supabase
              .from("shop_settings")
              .select("is_open")
              .eq("id", 1)
              .single();

            if (error) console.error("Supabase error:", error);

            const shopOpen = !!data?.is_open;

            if (shopOpen) {
              const orderLink = `https://customer-app-restuarant-application.onrender.com//?lineUserId=${userId}`;
              await client.replyMessage(event.replyToken, {
                type: "text",
                text: `กดที่ลิงก์นี้เพื่อสั่งอาหาร 🍛\n👉 ${orderLink}`,
              });
            } else {
              await client.replyMessage(event.replyToken, {
                type: "text",
                text: "ตอนนี้ร้านปิดแล้วค่ะ 🛑\nโปรดกลับมาสั่งอีกครั้งเมื่อร้านเปิดนะคะ 😊",
              });
            }
          } else {
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "พิมพ์คำว่า 'สั่งอาหาร' เพื่อเข้าสู่หน้าเว็บไซต์ครับ 😊",
            });
          }
        }
      }

      res.status(200).end();
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(200).end(); // ✅ อย่าส่ง 500 กลับ LINE
    }
  }
);

// --- ใช้ express.json() สำหรับ API อื่น ๆ ---
app.use(express.json());

// --- API แจ้งเตือน ---
app.post("/api/notify-order-status", async (req, res) => {
  try {
    const { lineUserId, orderNumber, status, orderTotal } = req.body;
    if (!lineUserId) return res.status(400).json({ error: "LINE User ID is required" });

    let message = "";
    switch (status) {
      case "accepted": message = `✅ ออเดอร์ #${orderNumber} ได้รับการยืนยันแล้ว!\n💰 ยอดรวม: ${orderTotal}฿`; break;
      case "rejected": message = `❌ ออเดอร์ #${orderNumber} ถูกปฏิเสธ\n💰 ยอดรวม: ${orderTotal}฿`; break;
      case "preparing": message = `👨‍🍳 ออเดอร์ #${orderNumber} กำลังเตรียมอาหาร`; break;
      case "ready": message = `🎉 ออเดอร์ #${orderNumber} พร้อมแล้ว! มารับได้เลยค่ะ 🍱`; break;
      default: message = `📋 สถานะออเดอร์ #${orderNumber}: ${status}`;
    }

    await client.pushMessage(lineUserId, { type: "text", text: message });
    res.json({ success: true });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.get("/", (req, res) => res.send("✅ LINE Bot Server is running!"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
