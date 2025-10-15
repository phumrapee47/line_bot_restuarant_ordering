import express from "express";
import { Client, middleware } from "@line/bot-sdk";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config(); // โหลดค่าจาก .env

const app = express();

// --- ตั้งค่า CORS เฉพาะเว็บคุณ ---
app.use(
  cors({
    origin: 'https://customer-ae0jfl72z-phumrapee47s-projects.vercel.app',
  })
);
app.use(express.json());

// --- ตั้งค่า LINE Bot ---
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// --- ตั้งค่า Supabase ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("❌ Missing required Supabase environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const client = new Client(config);

// --- Webhook รับข้อความจาก LINE ---
app.post("/webhook", middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    console.log("Received events:", JSON.stringify(events, null, 2));

    // ตรวจสอบว่ามี events หรือไม่
    if (!events || events.length === 0) {
      console.log("No events to process");
      return res.status(200).end();
    }

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userText = event.message.text.trim();
        const userId = event.source.userId;

        if (userText === "สั่งอาหาร") {
          // --- เช็กสถานะร้านจาก Supabase ---
          let shopOpen = false;
          try {
            const { data, error } = await supabase
            .from("shop_settings")
            .select("is_open")
            .eq("id", 1)
            .single();
          if (error) {
            console.error("Supabase error:", error);
            throw error;
          }
            // แปลงเป็น boolean เผื่อ DB เก็บเป็น 0/1
            shopOpen = !!data?.is_open;
          } catch (err) {
            console.error("Error loading shop status:", err);
          }

          if (shopOpen) {
            const orderLink = `https://customer-ae0jfl72z-phumrapee47s-projects.vercel.app/?lineUserId=${userId}`;
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
    res.status(500).end();
  }
});

// --- API ส่งแจ้งเตือนสถานะออเดอร์ไป LINE ---
app.post("/api/notify-order-status", async (req, res) => {
  try {
    const { lineUserId, orderNumber, status, orderTotal } = req.body;

    if (!lineUserId) {
      return res.status(400).json({ error: "LINE User ID is required" });
    }

    let message = "";
    switch (status) {
      case "accepted":
        message = `✅ ออเดอร์ #${orderNumber} ได้รับการยืนยันแล้ว!\n💰 ยอดรวม: ${orderTotal}฿`;
        break;
      case "rejected":
        message = `❌ ออเดอร์ #${orderNumber} ถูกปฏิเสธ\n💰 ยอดรวม: ${orderTotal}฿`;
        break;
      case "preparing":
        message = `👨‍🍳 ออเดอร์ #${orderNumber} กำลังเตรียมอาหาร`;
        break;
      case "ready":
        message = `🎉 ออเดอร์ #${orderNumber} พร้อมแล้ว! มารับได้เลยค่ะ 🍱`;
        break;
      default:
        message = `📋 สถานะออเดอร์ #${orderNumber}: ${status}`;
    }

    // ส่งข้อความไปยัง LINE
    await client.pushMessage(lineUserId, { type: "text", text: message });

    res.json({ success: true, message: "Notification sent successfully" });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// --- Health check ---
app.get("/", (req, res) => {
  res.send("✅ LINE Bot Server is running!");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
