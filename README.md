# 🎵 Nowtify - Spotify Müzik Paylaşım Platformu

Spotify hesabını bağla, dinlediğin müzikleri sergile ve dinleme geçmişini paylaş!

## ✨ Özellikler

- 🔐 **Kullanıcı Sistemi**: Güvenli kayıt olma ve giriş yapma
- 🎵 **Spotify Entegrasyonu**: Spotify hesabını bağla
- 📊 **Dinleme Geçmişi**: Otomatik şarkı geçmişi kaydetme
- 👤 **Kişisel Profil Sayfaları**: Her kullanıcının özel profil linki
- 🔒 **Gizlilik Ayarları**: Profilini herkese açık veya gizli yap
- ⚙️ **Özelleştirme**: Gösterilecek şarkı sayısını seç (10-50 arası)
- 🎶 **Şu Anda Dinleniyor**: Real-time müzik takibi
- 🎤 **Şarkı Sözleri**: LRC formatında senkronize şarkı sözleri
- 🎬 **YouTube Video**: YouTube'dan müzik videoları

## 🚀 Kurulum

### Backend (Railway)

1. **Gereksinimler**
   ```bash
   Node.js 18+
   ```

2. **Bağımlılıkları Yükle**
   ```bash
   cd backend
   yarn install
   ```

3. **Environment Variables**
   
   Railway'de aşağıdaki environment variables'ları ayarla:
   
   ```env
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=https://your-backend-url.railway.app/callback
   
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   
   JWT_SECRET=your_random_secret_key
   
   YT_KEY=your_youtube_api_key (optional)
   
   PORT=3000
   
   FRONTEND_URL=https://your-github-username.github.io/repo-name
   ```

4. **Supabase Database Kurulumu**
   
   - Supabase dashboard'a git
   - SQL Editor'ü aç
   - `backend/database.sql` dosyasındaki SQL kodunu çalıştır

5. **Deploy**
   ```bash
   # Railway'de otomatik deploy edilecek
   yarn start
   ```

### Frontend (GitHub Pages)

1. **Backend URL'ini Güncelle**
   
   `public/js/utils.js` dosyasında:
   ```javascript
   const API_BASE_URL = 'https://your-backend-url.railway.app';
   ```

2. **GitHub Pages Ayarları**
   
   - GitHub repo'nuzda Settings → Pages
   - Source: Deploy from a branch
   - Branch: main → /public klasörü
   - Save

3. **Deploy**
   ```bash
   git add .
   git commit -m "Deploy to GitHub Pages"
   git push origin main
   ```

## 📁 Proje Yapısı

```
/app/
├── backend/                 # Node.js/Express Backend
│   ├── server.js           # Ana server dosyası
│   ├── package.json        # Node.js dependencies
│   ├── database.sql        # Supabase SQL schema
│   └── .env.example        # Örnek environment variables
│
└── public/                 # Static Frontend (GitHub Pages)
    ├── index.html         # Login sayfası
    ├── signup.html        # Kayıt ol sayfası
    ├── dashboard.html     # Kullanıcı dashboard
    ├── profile.html       # Profil sayfası
    ├── settings.html      # Ayarlar sayfası
    ├── css/
    │   └── styles.css     # Tüm stiller
    └── js/
        └── utils.js       # Utility fonksiyonlar
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/signup` - Yeni kullanıcı kaydı
- `POST /api/auth/login` - Kullanıcı girişi
- `GET /api/auth/me` - Mevcut kullanıcı bilgisi

### User
- `GET /api/users/:username` - Kullanıcı profili
- `GET /api/users/:username/history` - Dinleme geçmişi
- `PUT /api/users/settings` - Ayarları güncelle

### Spotify
- `GET /api/spotify/login` - Spotify authorization URL'i al
- `GET /callback` - Spotify callback
- `GET /api/spotify/now-playing` - Şu anda çalan şarkı

## 🎨 Tasarım

- **Renk Paleti**
  - Spotify Yeşili: `#1DB954`
  - Koyu Arkaplan: `#121212`
  - Kart Arkaplanı: `#181818`
  - Metin: `#FFFFFF`
  - İkincil Metin: `#B3B3B3`

- **Font**: Montserrat (Google Fonts)

## 🔒 Güvenlik

- Şifreler bcrypt ile hashlenir
- JWT tokens 7 gün geçerli
- Row Level Security (Supabase)
- CORS ayarları
- Environment variables ile hassas bilgiler korunur

## 📱 Responsive Design

Tüm sayfalar mobil uyumlu!

## 🛠️ Geliştirme

```bash
# Backend development
cd backend
yarn dev

# Frontend local test (http-server ile)
cd public
npx http-server -p 8080
```

## 📝 TODO (İsteğe Bağlı)

- [ ] Profil fotoğrafı yükleme
- [ ] Takip sistemi (follow/unfollow)
- [ ] Playlist paylaşımı
- [ ] Şarkı istatistikleri (en çok dinlenenler)
- [ ] Sosyal paylaşım butonları

## 📄 Lisans

MIT

## 🤝 Katkıda Bulunma

Pull request'ler kabul edilir!

---

Made with 💚 by Nowtify Team
