# Deploying Mauqa on a DigitalOcean droplet

One Node process serves the API and the built frontend together. Nginx sits in front
of it only to terminate TLS and proxy through.

Replace `mauqa.example.com` with your domain and `you` with your login throughout.

> **HTTPS is not optional.** PWA installation, the Android share target and the
> microphone all require a secure origin. On plain HTTP the app loads but those three
> features silently do nothing.

---

## 0. Point the domain first

Add an **A record** for `mauqa.example.com` → your droplet's IP before starting, so the
certificate step later doesn't fail while DNS propagates.

## 1. Node 24

`node:sqlite` is flag-gated before Node 23.4, so Ubuntu's packaged Node is too old — the
app fails at import, not at query time.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
node -v          # must print v24.x
```

## 2. Clone and build

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone https://github.com/RahulAi2004/Mauqa.git mauqa
cd mauqa
npm install
npm run build
```

## 3. Environment

```bash
cp .env.example .env
nano .env
```

Set `OPENROUTER_API_KEY`. Leave `VITE_APK_URL` commented until the APK exists (step 7).

```bash
chmod 600 .env     # the key is readable by this file's owner only
```

## 4. Run it as a service

```bash
sudo nano /etc/systemd/system/mauqa.service
```

```ini
[Unit]
Description=Mauqa
After=network.target

[Service]
Type=simple
User=you
WorkingDirectory=/var/www/mauqa
Environment=NODE_ENV=production
Environment=API_PORT=4200
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`NODE_ENV=production` matters beyond logging: it is what puts the `Secure` flag on the
session cookie.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mauqa
systemctl status mauqa --no-pager
curl -s localhost:4200/api/status      # expect aiMode: "live"
```

## 5. Nginx + TLS

```bash
sudo nano /etc/nginx/sites-available/mauqa
```

```nginx
server {
    listen 80;
    server_name mauqa.example.com;

    # Screenshot uploads are base64 in a JSON body; the API accepts up to 25 MB.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:4200;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # A live extraction can take 15s+.
        proxy_read_timeout 60s;
    }
}
```

The default `client_max_body_size` is 1 MB, which would reject screenshot uploads with a
413 before they ever reach Node.

```bash
sudo ln -s /etc/nginx/sites-available/mauqa /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mauqa.example.com
```

Certbot rewrites the config for TLS and installs a renewal timer.

## 6. Verify

```bash
curl -s https://mauqa.example.com/api/status
curl -sI https://mauqa.example.com/manifest.webmanifest | head -1
```

Then on an Android phone: open the site in Chrome → menu → **Add to Home screen** →
share any post from another app → **Mauqa** should appear in the sheet.

## 7. Hosting the APK on the same server

Simplest path — serve it from the app itself:

```bash
# from your laptop, after PWABuilder produces the file
scp mauqa.apk you@YOUR_IP:/var/www/mauqa/public/mauqa.apk
```

`public/` is copied into `dist/` by the build, so it lands at
`https://mauqa.example.com/mauqa.apk`.

The same directory is where `assetlinks.json` goes:

```bash
scp assetlinks.json you@YOUR_IP:/var/www/mauqa/public/.well-known/assetlinks.json
```

Then wire the download button and rebuild — `VITE_APK_URL` is inlined at build time, so
a restart alone will not pick it up:

```bash
cd /var/www/mauqa
echo 'VITE_APK_URL=https://mauqa.example.com/mauqa.apk' >> .env
npm run build
sudo systemctl restart mauqa
```

Keep the `.apk` out of git — it is a build artifact, and GitHub rejects files over 100 MB.
Add `public/*.apk` to `.gitignore` if you want to be explicit.

---

## Updating after a code change

```bash
cd /var/www/mauqa
git pull
npm install
npm run build
sudo systemctl restart mauqa
```

## Backups

Everything lives in one file: `server/data/mauqa.db` (plus its `-wal` / `-shm`
companions). It holds accounts, password hashes and every saved opportunity.

```bash
sqlite3 server/data/mauqa.db ".backup '/home/you/mauqa-$(date +%F).db'"
```

Unlike a Render free instance, a droplet's disk is persistent — this data survives
restarts and redeploys. Back it up anyway before any migration.
