// controllers/match.js
const Match = require('../modelos/match'); // ATTENTION: J'ai corrigé le chemin ici vers 'modelos'

exports.getMatchDetails = async (req, res) => {
    try {
        const match = await Match.findById(req.params.matchId).populate({
            path: 'users',
            select: 'name photos age' // Infos de base des deux utilisateurs
        });

        if (!match) {
            return res.status(404).json({ message: 'Match non trouvé' });
        }

        // Sécurité : Vérifiez que l'utilisateur fait partie du match
        const isParticipant = match.users.some(user => user._id.toString() === req.auth.userId);

        if (!isParticipant) {
             return res.status(403).json({ message: 'Accès non autorisé à ce match' });
        }

        res.status(200).json(match);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
