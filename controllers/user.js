// controllers/user.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../modelos/user'); // ATTENTION: J'ai corrigé le chemin ici vers 'modelos'
const Match = require('../modelos/match'); // ATTENTION: J'ai corrigé le chemin ici vers 'modelos'
const fs = require('fs'); // Pour la suppression des fichiers (si multer est utilisé)

// --- Inscription et Connexion ---

exports.signup = async (req, res) => {
  try {
    const { email, password, name, gender, preference, age, location } = req.body;
    
    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashedPassword,
      name,
      gender,
      preference,
      age,
      location: {
        type: 'Point',
        coordinates: location.coordinates // [longitude, latitude]
      },
      photos: [] 
    });

    await user.save();
    res.status(201).json({ message: 'Utilisateur créé !' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé !' });
    }

    const valid = await bcrypt.compare(req.body.password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Mot de passe incorrect !' });
    }

    res.status(200).json({
      userId: user._id,
      token: jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      )
    });
  } catch (error) {
    res.status(500).json({ error });
  }
};

// --- Profil Utilisateur ---

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error });
  }
};

exports.updateUserProfile = async (req, res) => {
    try {
        if (req.auth.userId !== req.params.id) {
            return res.status(403).json({ message: 'Accès non autorisé' });
        }

        const updates = req.body;
        const newPhotoUrls = [];

        // Gestion des fichiers téléchargés par Multer
        if (req.files && req.files.length > 0) {
            // Dans un vrai déploiement, ces URL pointeraient vers S3/Cloudinary
            req.files.forEach(file => {
                newPhotoUrls.push(`${req.protocol}://${req.get('host')}/images/${file.filename}`);
            });
            // Ajoutez les nouvelles photos à la liste existante
            updates.photos = [...(await User.findById(req.params.id)).photos, ...newPhotoUrls];
        }

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// --- Découverte et Like ---

exports.getDiscoveryFeed = async (req, res) => {
  try {
    const currentUser = await User.findById(req.auth.userId);

    // 1. Définir les critères de recherche
    const exclusionList = [currentUser._id, ...currentUser.likedUsers, ...currentUser.matchedUsers];
    
    // Critères basés sur les préférences
    const preferenceFilter = currentUser.preference === 'Les deux'
      ? { gender: { $in: ['Homme', 'Femme', 'Autre'] } }
      : { gender: currentUser.preference };

    // Critères d'âge (simple exemple : + ou - 10 ans de la moyenne)
    // On pourrait ajouter des critères de distance ici
    const ageFilter = { age: { $gte: currentUser.age - 10, $lte: currentUser.age + 10 } };
    
    const users = await User.find({
      _id: { $nin: exclusionList },
      ...preferenceFilter,
      ...ageFilter,
    }).select('-password').limit(20); // Limiter à 20 profils

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


exports.likeUser = async (req, res) => {
  try {
    const currentUserId = req.auth.userId;
    const targetUserId = req.params.targetId;

    if (currentUserId === targetUserId) {
        return res.status(400).json({ message: 'Vous ne pouvez pas vous aimer vous-même.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
        return res.status(404).json({ message: 'Utilisateur cible non trouvé.' });
    }

    // 1. Enregistrer le "like" pour l'utilisateur actuel
    await User.findByIdAndUpdate(currentUserId, { $addToSet: { likedUsers: targetUserId } });

    let isMatch = false;
    let newMatch = null;

    // 2. Vérifier si l'utilisateur cible a déjà liké l'utilisateur actuel (Match !)
    if (targetUser.likedUsers.includes(currentUserId)) {
      isMatch = true;
      
      // Créer le nouveau match
      newMatch = new Match({ users: [currentUserId, targetUserId] });
      await newMatch.save();

      // Mettre à jour les deux utilisateurs pour ajouter l'ID du match
      await User.findByIdAndUpdate(currentUserId, { $addToSet: { matchedUsers: targetUserId } });
      await User.findByIdAndUpdate(targetUserId, { $addToSet: { matchedUsers: currentUserId } });
    }

    res.status(200).json({ message: 'Like enregistré', isMatch, matchId: newMatch ? newMatch._id : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- Matchs ---

exports.getMatches = async (req, res) => {
    try {
        const currentUser = await User.findById(req.auth.userId).populate({
            path: 'matchedUsers',
            select: '-password -likedUsers -matchedUsers' // Sélectionne seulement les infos nécessaires
        });

        if (!currentUser) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }

        res.status(200).json(currentUser.matchedUsers);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
