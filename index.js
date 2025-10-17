import express from "express";
import { Client, middleware } from "@line/bot-sdk";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ✅ แก้ไข CORS - ลบ "/" ซ้อนท้าย
app.use(cors({
  origin: [
    'https://customer-app-restuarant-application.onrender.com',
    'https://admin-dashboard-restuarant-application.onrender.com', // เพิ่ม URL ของ Admin Dashboard
    'http://localhost:5173' // สำหรับ dev
  ],
  credentials: true
}));

// --- LINE Bot config ---
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_ANON_KEY
);

// ✅ ใช้ raw body เฉพาะ webhook
app.post("/webhook",
  express.raw({ type: "application/json" }),
  middleware(config),
  async (req, res) => {
    try {
      const body = req.body;
      const events = body.events;

      console.log("📥 Received events:", JSON.stringify(events, null, 2));

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

            if (error) console.error("❌ Supabase error:", error);

            const shopOpen = !!data?.is_open;

            if (shopOpen) {
              // ✅ แก้ไข URL ให้ถูกต้อง (ลบ "/" ซ้อน)
              const orderLink = `https://customer-app-restuarant-application.onrender.com?lineUserId=${userId}`;
              await client.replyMessage(event.replyToken, {
                type: "text",
                text: `✨ กดที่ลิงก์นี้เพื่อสั่งอาหาร 🍛\n👉 ${orderLink}`,
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
      console.error("❌ Webhook error:", err);
      res.status(200).end();
    }
  }
);

// ✅ ใช้ express.json() สำหรับ API อื่น ๆ
app.use(express.json());

// ✅ API แจ้งเตือนสถานะออเดอร์ (ปรับปรุงแล้ว)
app.post("/api/notify-order-status", async (req, res) => {
  try {
    console.log("📨 Notification request:", req.body);
    
    const { lineUserId, orderNumber, status, orderTotal } = req.body;
    
    // Validation
    if (!lineUserId) {
      console.error("❌ Missing LINE User ID");
      return res.status(400).json({ 
        success: false, 
        error: "LINE User ID is required" 
      });
    }

    // สร้างข้อความตามสถานะ
    let message = "";
    let emoji = "";
    
    switch (status) {
      case "ยืนยันแล้ว":
      case "accepted":
        emoji = "✅";
        message = `✅ ออเดอร์ #${orderNumber} ได้รับการยืนยันแล้ว!\n💰 ยอดรวม: ${orderTotal}฿\n⏰ กำลังเตรียมอาหารให้คุณค่ะ`;
        break;
      
      case "ปฏิเสธ":
      case "rejected":
        emoji = "❌";
        message = `❌ ออเดอร์ #${orderNumber} ถูกปฏิเสธ\n💰 ยอดรวม: ${orderTotal}฿\n😔 ขออภัยค่ะ กรุณาติดต่อร้านเพื่อสอบถามเพิ่มเติม`;
        break;
      
      case "พร้อมแล้ว":
      case "ready":
        emoji = "🎉";
        message = `🎉 ออเดอร์ #${orderNumber} พร้อมแล้ว!\n🍱 มารับได้เลยค่ะ\n💰 ยอดรวม: ${orderTotal}฿`;
        break;
      
      default:
        emoji = "📋";
        message = `📋 สถานะออเดอร์ #${orderNumber}: ${status}\n💰 ยอดรวม: ${orderTotal}฿`;
    }

    // ส่งข้อความผ่าน LINE
    await client.pushMessage(lineUserId, {
      type: "text",
      text: message
    });

    console.log(`✅ Notification sent to ${lineUserId} for order #${orderNumber}`);
    
    res.json({ 
      success: true,
      message: "Notification sent successfully" 
    });
    
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to send notification",
      details: error.message 
    });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "✅ LINE Bot Server is running!",
    endpoints: {
      webhook: "/webhook",
      notify: "/api/notify-order-status"
    }
  });
});

// ✅ Test endpoint เพื่อทดสอบการส่งแจ้งเตือน
app.post("/api/test-notification", async (req, res) => {
  try {
    const { lineUserId } = req.body;
    
    if (!lineUserId) {
      return res.status(400).json({ error: "LINE User ID required" });
    }

    await client.pushMessage(lineUserId, {
      type: "text",
      text: "🧪 นี่คือข้อความทดสอบจากระบบ!\nถ้าคุณเห็นข้อความนี้ แสดงว่าระบบแจ้งเตือนทำงานได้แล้ว ✅"
    });

    res.json({ success: true, message: "Test notification sent!" });
  } catch (error) {
    console.error("Test notification error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});