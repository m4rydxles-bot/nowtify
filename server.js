import express from 'express';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import dotenv from 'dotenv';
import { findLyrics } from 'lrclib-api';
import cookieParser from 'cookie-parser';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/callback';
const YOUTUBE_API_KEY = process.env.YT_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

const app = express();
const server = createServer(app);

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Socket.io setup
const io = new SocketIoServer(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('../public'));

// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token gerekli' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Geçersiz token' });
        }
        req.user = user;
        next();
    });
};

let lastTrackUri = '';
const userSockets = new Map(); // username -> socket.id mapping

// ============= AUTH ROUTES =============

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Tüm alanlar gerekli' });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('username')
            .or(`username.eq.${username},email.eq.${email}`)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Kullanıcı adı veya email zaten kullanılıyor' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{
                username,
                email,
                password: hashedPassword,
                profile_visibility: 'public',
                history_limit: 25,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Generate JWT
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Kayıt başarısız' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
        }

        // Get user
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                spotify_connected: !!user.spotify_access_token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Giriş başarısız' });
    }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('id, username, email, profile_visibility, history_limit, spotify_connected:spotify_access_token')
            .eq('id', req.user.id)
            .single();

        res.json({
            user: {
                ...user,
                spotify_connected: !!user.spotify_connected
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Kullanıcı bilgisi alınamadı' });
    }
});

// ============= USER ROUTES =============

// Get user profile
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const { data: user } = await supabase
            .from('users')
            .select('id, username, profile_visibility, created_at')
            .eq('username', username)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // Check if profile is public
        if (user.profile_visibility === 'private') {
            // Check if request is from the owner
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            
            if (token) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    if (decoded.id !== user.id) {
                        return res.status(403).json({ error: 'Bu profil gizli' });
                    }
                } catch {
                    return res.status(403).json({ error: 'Bu profil gizli' });
                }
            } else {
                return res.status(403).json({ error: 'Bu profil gizli' });
            }
        }

        // Get listening history
        const { data: history } = await supabase
            .from('listening_history')
            .select('*')
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(user.history_limit || 25);

        res.json({
            user: {
                username: user.username,
                member_since: user.created_at,
                profile_visibility: user.profile_visibility
            },
            history: history || []
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ error: 'Profil bilgisi alınamadı' });
    }
});

// Update user settings
app.put('/api/users/settings', authenticateToken, async (req, res) => {
    try {
        const { profile_visibility, history_limit } = req.body;
        const updates = {};

        if (profile_visibility) updates.profile_visibility = profile_visibility;
        if (history_limit) updates.history_limit = history_limit;

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, user: data });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
});

// Get user's listening history
app.get('/api/users/:username/history', async (req, res) => {
    try {
        const { username } = req.params;

        // Get user
        const { data: user } = await supabase
            .from('users')
            .select('id, history_limit')
            .eq('username', username)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        // Get history
        const { data: history } = await supabase
            .from('listening_history')
            .select('*')
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(user.history_limit || 25);

        res.json({ history: history || [] });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Geçmiş alınamadı' });
    }
});

// ============= SPOTIFY ROUTES =============

app.get('/api/spotify/login', authenticateToken, (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(500).json({ error: 'Spotify API bilgileri yüklenemedi!' });
    }

    const scope = 'user-read-playback-state user-read-currently-playing';
    const state = req.user.id; // Use user ID as state
    
    const authUrl = 'https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: state
        }).toString();
    
    res.json({ auth_url: authUrl });
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null; // user ID

    if (!code) {
        return res.redirect(`${FRONTEND_URL}?error=yetki_reddedildi`);
    }

    const authOptions = {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            code: code,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString()
    };

    try {
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', authOptions);
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;

        // Save tokens to user
        if (state) {
            await supabase
                .from('users')
                .update({
                    spotify_access_token: accessToken,
                    spotify_refresh_token: refreshToken
                })
                .eq('id', state);
        }

        res.redirect(`${FRONTEND_URL}/dashboard.html?spotify_connected=true`);
    } catch (error) {
        console.error('Spotify token error:', error);
        res.redirect(`${FRONTEND_URL}?error=spotify_baglanti_hatasi`);
    }
});

// Get currently playing track
app.get('/api/spotify/now-playing', authenticateToken, async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('spotify_access_token')
            .eq('id', req.user.id)
            .single();

        if (!user || !user.spotify_access_token) {
            return res.status(400).json({ error: 'Spotify bağlı değil' });
        }

        const trackData = await fetchTrack(user.spotify_access_token);
        res.json(trackData || { playing: false });
    } catch (error) {
        res.status(500).json({ error: 'Şarkı bilgisi alınamadı' });
    }
});

// ============= HELPER FUNCTIONS =============

async function fetchTrack(token) {
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (r.status === 204) return null;
    if (r.status === 401) return null;
    
    return await r.json();
}

async function getLRC(trackTitle, durationMs) {
    const parts = trackTitle.split(' - ');
    const artist = parts[0].trim();
    const title = parts.length > 1 ? parts[1].trim() : trackTitle.trim();
    const simpleArtist = artist.split(',')[0].trim().replace(/\s*\(feat\..*?\)/i, '');

    const searchQuery = {
        track_name: title,
        artist_name: simpleArtist,
    };

    try {
        const data = await findLyrics(searchQuery);
        if (data && data.id) {
            const bestMatch = data;
            if (bestMatch.syncedLyrics && !bestMatch.instrumental) {
                return bestMatch.syncedLyrics;
            }
            if (bestMatch.plainLyrics && !bestMatch.instrumental) {
                const lines = bestMatch.plainLyrics.split(/\r?\n/).filter(line => line.trim() !== '');
                return lines.map(line => `[00:00.00]${line}`).join('\n');
            }
        }
        return `[00:01.00]Bu şarkı için LRC metni lrclib.net'te bulunamadı.`;
    } catch (error) {
        console.error("LRC Çekme Hatası:", error.message);
        return `[00:01.00]LRC Lib servisiyle bağlantı kurulamadı.`;
    }
}

async function searchYoutube(query) {
    if (!YOUTUBE_API_KEY) return null;

    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + ' official video')}&type=video&key=${YOUTUBE_API_KEY}&maxResults=1`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return data.items[0].id.videoId;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Save track to history
async function saveToHistory(userId, trackData) {
    try {
        const track = trackData.item;
        await supabase
            .from('listening_history')
            .insert([{
                user_id: userId,
                track_name: track.name,
                artist_name: track.artists.map(a => a.name).join(', '),
                album_name: track.album.name,
                album_image: track.album.images[0]?.url,
                track_uri: track.uri,
                duration_ms: track.duration_ms,
                played_at: new Date().toISOString()
            }]);
    } catch (error) {
        console.error('Save to history error:', error);
    }
}

// ============= SOCKET.IO =============

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register', (username) => {
        userSockets.set(username, socket.id);
        console.log(`User ${username} registered with socket ${socket.id}`);
    });

    socket.on('statusUpdate', async (data) => {
        if (!data || !data.item || (data.is_playing === false && data.progress_ms === 0)) {
            io.emit('syncCommand', { command: 'stop' });
            lastTrackUri = '';
            return;
        }

        const track = data.item;
        const isPlaying = data.is_playing;
        const progressMs = data.progress_ms;
        const trackUri = track.uri;
        const trackTitle = `${track.artists.map(a => a.name).join(', ')} - ${track.name}`;
        const durationMs = track.duration_ms;

        // Save to history if new track
        if (trackUri !== lastTrackUri && data.userId) {
            await saveToHistory(data.userId, data);
        }

        if (trackUri !== lastTrackUri) {
            lastTrackUri = trackUri;
            const lrcContent = await getLRC(trackTitle, durationMs);
            const videoId = await searchYoutube(trackTitle);

            if (videoId) {
                io.emit('syncCommand', {
                    command: 'load',
                    videoId: videoId,
                    progress: progressMs,
                    trackTitle: trackTitle,
                    duration: durationMs,
                    lrc: lrcContent,
                    albumImage: track.album.images[0]?.url
                });
                return;
            } else {
                io.emit('syncCommand', { 
                    command: 'stop', 
                    trackTitle: `YouTube'da bulunamadı: ${trackTitle}` 
                });
                return;
            }
        }

        if (isPlaying) {
            io.emit('syncCommand', {
                command: 'play',
                progress: progressMs,
                duration: durationMs
            });
        } else {
            io.emit('syncCommand', {
                command: 'pause',
                progress: progressMs,
                duration: durationMs
            });
        }
    });

    socket.on('disconnect', () => {
        // Remove from userSockets
        for (let [username, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                userSockets.delete(username);
                console.log(`User ${username} disconnected`);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
