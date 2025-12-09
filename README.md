// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const userRoutes = require('./routes/user');
const matchRoutes = require('./routes/match');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connexion à MongoDB réussie !'))
  .catch((error) => console.log('Connexion à MongoDB échouée !', error));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);

// Gestion du port (utilise le port 10000 requis par Render ou 3000 par défaut)
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Serveur Genlove démarré sur le port ${port}`);
});
