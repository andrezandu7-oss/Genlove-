// routes/user.js
const express = require('express');
const router = express.Router();
const userCtrl = require('../controllers/user');
const auth = require('../middleware/auth');
const multer = require('../middleware/multer-config');

// Route d'inscription et de connexion (pas besoin d'authentification)
router.post('/signup', userCtrl.signup);
router.post('/login', userCtrl.login);

// Routes sécurisées (nécessitent un token JWT)
router.get('/:id', auth, userCtrl.getUserProfile);
router.put('/:id', auth, multer, userCtrl.updateUserProfile);
router.get('/feed/discover', auth, userCtrl.getDiscoveryFeed);
router.post('/like/:targetId', auth, userCtrl.likeUser);
router.get('/matches/all', auth, userCtrl.getMatches);

module.exports = router;
