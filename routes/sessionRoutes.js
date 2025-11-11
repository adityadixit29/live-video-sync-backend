const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const { v4: uuidv4 } = require('uuid');

// Create a new session (admin)
router.post('/create-session', async (req, res) => {
  try {
    const unique_id = uuidv4();
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const userurl = `${baseUrl}/session/${unique_id}`;

    const session = new Session({
      type: 'admin',
      unique_id: unique_id,
      userurl: userurl
    });

    await session.save();

    res.status(201).json({
      success: true,
      session: {
        id: session.id,
        type: session.type,
        unique_id: session.unique_id,
        userurl: session.userurl
      }
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating session',
      error: error.message
    });
  }
});

// Get session by unique_id
// Returns admin session if it exists (students can access admin sessions)
router.get('/session/:unique_id', async (req, res) => {
  try {
    const { unique_id } = req.params;
    console.log('Fetching session for unique_id:', unique_id);
    
    // First try to find admin session (primary session)
    let session = await Session.findOne({ unique_id, type: 'admin' });
    
    // If no admin session, try to find any session with this unique_id
    if (!session) {
      session = await Session.findOne({ unique_id });
    }

    if (!session) {
      console.log('Session not found for unique_id:', unique_id);
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    console.log('Session found:', session.type, session.unique_id);

    res.status(200).json({
      success: true,
      session: {
        id: session.id,
        type: session.type,
        unique_id: session.unique_id,
        userurl: session.userurl
      }
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching session',
      error: error.message
    });
  }
});

// Join session as student
router.post('/join-session/:unique_id', async (req, res) => {
  try {
    const { unique_id } = req.params;
    const adminSession = await Session.findOne({ unique_id, type: 'admin' });

    if (!adminSession) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Try to create or find student session (optional - doesn't block joining)
    let studentSession = null;
    try {
      // Check if student session already exists
      studentSession = await Session.findOne({ unique_id, type: 'student' });

      if (!studentSession) {
        // Try to create a new student session
        studentSession = new Session({
          type: 'student',
          unique_id: unique_id,
          userurl: adminSession.userurl
        });
        await studentSession.save();
      }
    } catch (saveError) {
      // If save fails (e.g., duplicate key or other error), try to find it
      if (saveError.code === 11000) {
        studentSession = await Session.findOne({ unique_id, type: 'student' });
      }
      // If still null, that's okay - we'll use admin session info
      console.log('Student session creation optional - using admin session info');
    }

    // Return session info (use student session if available, otherwise admin session)
    const sessionToReturn = studentSession || adminSession;

    res.status(200).json({
      success: true,
      session: {
        id: sessionToReturn.id || adminSession.id,
        type: 'student', // Always return as student type for joined sessions
        unique_id: sessionToReturn.unique_id,
        userurl: sessionToReturn.userurl
      }
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({
      success: false,
      message: 'Error joining session',
      error: error.message
    });
  }
});

module.exports = router;

