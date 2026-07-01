# 🚀 راهنمای دیپلوی روی VPS ایرانی (آرون‌وب و مشابه)

## پیش‌نیاز سرور
- اوبونتو ۲۲.۰۴ یا ۲۴.۰۴ (پیشنهادی)
- حداقل ۱ گیگ رم
- دسترسی SSH

---

## ۱. اتصال به سرور و آپدیت

```bash
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y
```

## ۲. نصب Node.js (نسخه ۲۰ LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential
node -v   # باید v20.x نشون بده
```

> `build-essential` لازمه چون `better-sqlite3` یه پکیج native هست و موقع نصب کامپایل می‌شه.

## ۳. آپلود پروژه

از روی سیستم خودت (نه روی سرور):
```bash
scp barber-backend.zip root@YOUR_SERVER_IP:/root/
```

روی سرور:
```bash
cd /root
apt install -y unzip
unzip barber-backend.zip
cd barber-backend
```

## ۴. نصب وابستگی‌ها و راه‌اندازی دیتابیس

```bash
npm install
cp .env.example .env
nano .env   # مقادیر رو واقعی کن (پایین توضیح دادم)
npm run db:init
npm run db:seed
```

### مقادیر مهم `.env` که باید عوض کنی:
```env
NODE_ENV=production
JWT_SECRET=یک_رشته_رندوم_و_طولانی_بساز
ADMIN_PIN=یک_پین_جدید_۴_رقمی
ALLOWED_ORIGINS=https://yourdomain.com
```

برای ساخت `JWT_SECRET` امن:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## ۵. تست اولیه (قبل از PM2)

```bash
npm start
```
اگه پیام `🚀 General Barber Shop API` رو دیدی، یعنی کار می‌کنه. با `Ctrl+C` ببندش و برو مرحله بعد.

## ۶. نصب PM2 (نگه‌داشتن سرور همیشه روشن)

```bash
npm install -g pm2
pm2 start src/index.js --name barber-api
pm2 save
pm2 startup   # دستوری که نشون می‌ده رو کپی و اجرا کن تا با ریبوت سرور خودش بالا بیاد
```

دستورات مفید PM2:
```bash
pm2 status          # وضعیت
pm2 logs barber-api  # لاگ زنده
pm2 restart barber-api
```

## ۷. نصب Nginx (Reverse Proxy + HTTPS)

```bash
apt install -y nginx
```

فایل کانفیگ بساز:
```bash
nano /etc/nginx/sites-available/barber
```

محتوا:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }
}
```

فعالش کن:
```bash
ln -s /etc/nginx/sites-available/barber /etc/nginx/sites-enabled/
nginx -t        # تست کانفیگ
systemctl restart nginx
```

## ۸. دامنه رو وصل کن

توی پنل دامنه‌ات (مثلاً ثبت‌شده در ایران‌نیک یا سرورهای دیگه):
- یک رکورد `A` بساز که `yourdomain.com` به IP سرورت اشاره کنه
- صبر کن DNS propagate بشه (چند دقیقه تا چند ساعت)

## ۹. گواهی SSL رایگان (HTTPS)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
سوالاتش رو جواب بده (ایمیل، توافق‌نامه) — خودش Nginx رو برای HTTPS تنظیم می‌کنه.

## ۱۰. تست نهایی

برو به مرورگر:
```
https://yourdomain.com/           → صفحه اصلی آرایشگاه
https://yourdomain.com/booking.html → رزرو نوبت
https://yourdomain.com/admin.html   → پنل مدیر
https://yourdomain.com/api/health   → باید {"status":"ok"} برگردونه
```

---

## ⚠️ نکات امنیتی قبل از رفتن لایو

- [ ] `ADMIN_PIN` رو از `1234` به یه چیز دیگه عوض کن
- [ ] `JWT_SECRET` رندوم و قوی باشه
- [ ] فایروال سرور: فقط پورت‌های ۲۲ (SSH)، ۸۰ و ۴۴۳ باز باشن
  ```bash
  ufw allow 22
  ufw allow 80
  ufw allow 443
  ufw enable
  ```
- [ ] پسورد کارمندان نمونه (`123456`) رو عوض کن یا کارمندای واقعی جدید بساز
- [ ] OTP فعلاً فقط توی لاگ سرور چاپ می‌شه — برای پروداکشن واقعی باید به یه پنل پیامک (کاوه‌نگار و غیره) وصلش کنیم

## 🔄 آپدیت کردن پروژه در آینده

```bash
cd /root/barber-backend
# فایل‌های جدید رو دوباره scp کن یا با git pull بیار
pm2 restart barber-api
```

## 💾 بکاپ‌گیری از دیتابیس

```bash
# دستی
cp /root/barber-backend/data/barber.db /root/backups/barber-$(date +%Y%m%d).db

# خودکار با cron (هر شب ساعت ۳ صبح)
crontab -e
# این خط رو اضافه کن:
0 3 * * * cp /root/barber-backend/data/barber.db /root/backups/barber-$(date +\%Y\%m\%d).db
```
