const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const sessionRoutes = require('./routes/sessionRoutes');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Video Player Backend API is running',
    version: '1.0.0',
    endpoints: {
      test: '/',
      createSession: '/api/create-session',
      getSession: '/api/session/:unique_id',
      joinSession: '/api/join-session/:unique_id',
      uploadVideo: '/api/upload-video/:unique_id'
    }
  });
});
// Routes
app.use('/api', sessionRoutes);

// Video upload endpoint
app.post('/api/upload-video/:unique_id', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  
  const videoUrl = `http://localhost:${process.env.PORT || 5000}/uploads/${req.file.filename}`;
  res.json({ 
    success: true, 
    videoUrl: videoUrl,
    filename: req.file.filename 
  });
});

// Store video state for each session
const sessionVideoStates = {};

// Socket.io for real-time video synchronization
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a session room
  socket.on('join-session', (unique_id) => {
    socket.join(unique_id);
    console.log(`User ${socket.id} joined session ${unique_id}`);
    
    // Send current video state to newly joined user if it exists
    if (sessionVideoStates[unique_id]) {
      socket.emit('video-state-sync', sessionVideoStates[unique_id]);
    }
  });

  // Handle video play/pause events
  socket.on('video-play', (data) => {
    socket.to(data.unique_id).emit('video-play', data);
  });

  socket.on('video-pause', (data) => {
    socket.to(data.unique_id).emit('video-pause', data);
  });

  // Handle video time update
  socket.on('video-time-update', (data) => {
    socket.to(data.unique_id).emit('video-time-update', data);
  });

  // Handle video volume change
  socket.on('video-volume-change', (data) => {
    socket.to(data.unique_id).emit('video-volume-change', data);
  });

  // Handle video source change
  socket.on('video-source-change', (data) => {
    // Store video state
    if (!sessionVideoStates[data.unique_id]) {
      sessionVideoStates[data.unique_id] = {};
    }
    sessionVideoStates[data.unique_id].src = data.src;
    sessionVideoStates[data.unique_id].currentTime = data.currentTime || 0;
    sessionVideoStates[data.unique_id].volume = data.volume || 1;
    sessionVideoStates[data.unique_id].isPlaying = data.isPlaying || false;
    
    socket.to(data.unique_id).emit('video-source-change', data);
  });

  // Handle video state updates (for storing current state)
  socket.on('video-state-update', (data) => {
    if (!sessionVideoStates[data.unique_id]) {
      sessionVideoStates[data.unique_id] = {};
    }
    if (data.src) sessionVideoStates[data.unique_id].src = data.src;
    if (data.currentTime !== undefined) sessionVideoStates[data.unique_id].currentTime = data.currentTime;
    if (data.volume !== undefined) sessionVideoStates[data.unique_id].volume = data.volume;
    if (data.isPlaying !== undefined) sessionVideoStates[data.unique_id].isPlaying = data.isPlaying;
  });

  // Request current video state (for students joining late)
  socket.on('request-video-state', (data) => {
    if (sessionVideoStates[data.unique_id]) {
      socket.emit('video-state-sync', sessionVideoStates[data.unique_id]);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

