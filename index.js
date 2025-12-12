import express from "express";
import { Client, middleware } from "@line/bot-sdk";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use("/api", express.json());

// ✅ แก้ไข CORS - ลบ "/" ซ้อนท้าย
app.use(
  cors({
    origin: [
      // "http://localhost:5173", // Vite dev server
      // "http://localhost:3000",
      "https://admin-dashboard-restuarant-application.onrender.com", // ตัวจริง (แก้ให้ตรงชื่อจริง)
      "https://customer-app-restuarant-application.onrender.com" // ถ้ามีอีกตัว
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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

      // ✅ ส่วนที่แก้ไข - ใน webhook handler
      for (const event of events) {
        if (event.type === "message" && event.message.type === "text") {
          const userText = event.message.text.trim();
          const userId = event.source.userId;

          // ✅ ใช้ else if เพื่อไม่ให้ซ้ำซ้อน
          if (userText === "สั่งอาหาร") {
            const { data, error } = await supabase  // ✅ แก้จาก superbase
              .from("shop_settings")
              .select("is_open")
              .eq("id", 1)
              .single();

            if (error) console.error("❌ Supabase error:", error);

            const shopOpen = !!data?.is_open;

            if (shopOpen) {
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
          } 
          // ✅ เปลี่ยนเป็น else if และลบโค้ดซ้ำ
          else if (userText === "สถานะร้าน") {
            const { data, error } = await supabase  // ✅ แก้จาก superbase
              .from("shop_settings")
              .select("is_open")
              .eq("id", 1)
              .single();

            if (error) {
              console.error("❌ Supabase error:", error);
              await client.replyMessage(event.replyToken, {
                type: "text",
                text: "❌ เกิดข้อผิดพลาดในการตรวจสอบสถานะร้าน กรุณาลองใหม่อีกครั้ง"
              });
              continue;
            }

            const shopOpen = !!data?.is_open;

            if (shopOpen) {
              await client.replyMessage(event.replyToken, {
                type: "text",
                text: "✅ ตอนนี้ร้านเปิดแล้วค่ะ 🟢\nพิมพ์ 'สั่งอาหาร' เพื่อสั่งได้เลยค่ะ 😊"
              });
            } else {
              await client.replyMessage(event.replyToken, {
                type: "text",
                text: "🛑 ตอนนี้ร้านปิดแล้วค่ะ\nโปรดกลับมาสั่งอีกครั้งเมื่อร้านเปิดนะคะ 😊"
              });
            }
          }
          // ✅ (Optional) ข้อความเมื่อพิมพ์คำอื่น
          else {
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "📝 คำสั่งที่ใช้ได้:\n• พิมพ์ 'สั่งอาหาร' เพื่อเข้าสู่หน้าเว็บไซต์\n• พิมพ์ 'สถานะร้าน' เพื่อเช็คสถานะ"
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
// app.use(express.json());

// ✅ API แจ้งเตือนสถานะออเดอร์ (ปรับปรุงแล้ว)
app.post("/api/notify-order-status", async (req, res) => {
  console.log("📨 Headers:", req.headers);
  console.log("📨 Body:", req.body);
  console.log("📨 Origin:", req.headers.origin);
  try {
    console.log("📨 Notification request:", req.body);
    
    const { lineUserId, orderNumber, status, orderTotal } = req.body;
    console.log("📩 LINE Notify Payload:", req.body);
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
        message = `❌ ออเดอร์ #${orderNumber} ถูกปฏิเสธ\n😔 ขออภัยค่ะ กรุณาติดต่อร้านเพื่อสอบถามเพิ่มเติม`;
        break;
      
      case "พร้อมแล้ว":
      case "ready":
        emoji = "🎉";
        message = `🎉 ออเดอร์ #${orderNumber} พร้อมแล้ว!\n🍱 มารับได้เลยค่ะ`;
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
  // res.send('LINE Bot server running');
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

// API สำหรับแจ้งเตือนไปยัง Admin เมื่อมีออเดอร์ใหม่เข้ามา
app.post('/api/notify-admin-order', async (req, res) => {
  try {
    const adminLineId = process.env.ADMIN_LINE_USER_ID;
    if (!adminLineId) {
      return res.status(500).json({ success: false, error: 'ADMIN_LINE_USER_ID not configured in server .env' });
    }

    const { orderId, customerName, totalAmount, items } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    // สร้างข้อความสำหรับ admin (เรียบง่าย)
    const message = 'มีออเดอร์มาแล้ว';

    await client.pushMessage(adminLineId, { type: 'text', text: message });

    return res.json({ success: true, message: 'Notified admin' });
  } catch (error) {
    console.error('Error notifying admin:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});