// modelos/user.js
const mongoose = require('mongoose');
const validator = require('validator');

const userSchema = mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    validate: [validator.isEmail, 'Veuillez entrer une adresse email valide']
  },
  password: { type: String, required: true },
  name: { type: String, required: true },
  bio: { type: String, required: false },
  gender: { type: String, required: true, enum: ['Homme', 'Femme', 'Autre'] },
  preference: { type: String, required: true, enum: ['Homme', 'Femme', 'Les deux'] },
  age: { type: Number, required: true, min: 18 },
  photos: [{ type: String }], // URLs vers les photos stockées
  likedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  matchedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  }
});

userSchema.index({ location: '2dsphere' }); // Index pour les requêtes géospatiales

module.exports = mongoose.model('User', userSchema);
           
