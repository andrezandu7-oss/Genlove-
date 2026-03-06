// =======================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO FINAL CORRIGIDA - 2026
// =======================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
const QRCode = require('qrcode');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// CONFIGURAÇÕES
// =======================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// =======================
// CONEXÃO MONGODB
// =======================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connectado'))
    .catch(err => console.log('❌ MongoDB erro: ', err));

// =======================
// FUNÇÕES AUXILIARES
// =======================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const dia = new Date().getDate().toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    const prefixos = { 1: 'GEN', 2: 'SAU', 3: 'INC', 4: 'APT', 5: 'MAT', 6: 'CPN', 7: 'EPI', 8: 'CSD' };
    const sequencia = String(Math.floor(1000 + Math.random() * 9000));
    return `${prefixos[tipo]}-${ano}${mes}${dia}-${sequencia}-${random}`;
}

// =======================
// MODELOS DE DADOS
// =======================
const User = mongoose.model('User', new mongoose.Schema({
    nome: String, email: { type: String, unique: true }, password: String, role: { type: String, default: 'admin' }
}));

const Lab = mongoose.model('Lab', new mongoose.Schema({
    labId: { type: String, unique: true },
    nome: { type: String, required: true },
    nif: { type: String, required: true, unique: true },
    tipo: { type: String, enum: ['Público', 'Privado', 'Misto'], required: true },
    provincia: { type: String, required: true },
    municipio: String,
    endereco: { type: String, required: true },
    telefone: { type: String, required: true },
    email: { type: String, required: true },
    diretor: { type: String, required: true },
    apiKey: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalEmissoes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
}));

const Hospital = mongoose.model('Hospital', new mongoose.Schema({ nome: String, nif: String, provincia: String, ativo: { type: Boolean, default: true } }));
const Empresa = mongoose.model('Empresa', new mongoose.Schema({ nome: String, nif: String, provincia: String, ativo: { type: Boolean, default: true } }));

const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: Number,
    paciente: { nomeCompleto: String, bi: String, dataNascimento: Date, genero: String, telefone: String },
    laborantin: { nome: String, registro: String },
    dados: mongoose.Schema.Types.Mixed,
    imc: Number,
    idade: Number,
    classificacaoIMC: String,
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now }
});

certificateSchema.pre('save', function(next) {
    if (this.paciente?.dataNascimento) {
        const nascimento = new Date(this.paciente.dataNascimento);
        this.idade = new Date().getFullYear() - nascimento.getFullYear();
    }
    if (this.dados?.peso && this.dados?.altura) {
        const p = parseFloat(this.dados.peso); const a = parseFloat(this.dados.altura);
        if (p && a > 0) {
            this.imc = parseFloat((p / (a * a)).toFixed(2));
            if (this.imc < 18.5) this.classificacaoIMC = "Abaixo do peso";
            else if (this.imc < 25) this.classificacaoIMC = "Peso normal";
            else if (this.imc < 30) this.classificacaoIMC = "Sobrepeso";
            else this.classificacaoIMC = "Obesidade";
        }
    }
    next();
});

const Certificate = mongoose.model('Certificate', certificateSchema);

// ===============================================
// MIDDLEWARES
// ===============================================
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        next();
    } catch (err) { res.status(401).json({ erro: 'Token inválido' }); }
};

const labMiddleware = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (!lab) return res.status(401).json({ erro: 'Chave inválida' });
    req.lab = lab;
    next();
};

// ==============================================
// ROTAS DE AUTENTICAÇÃO
// ==============================================
app.get('/', (req, res) => res.send('<h1>SNS Angola Online</h1><a href="/ministerio">Ir para Ministério</a>'));

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
        const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '8h' });
        return res.json({ token });
    }
    res.status(401).json({ error: 'Incorreto' });
});

app.post('/api/labs/verificar', async (req, res) => {
    const lab = await Lab.findOne({ apiKey: req.body.apiKey, ativo: true });
    res.json({ valido: !!lab });
});

// ================================================
// ROTAS API CORRIGIDAS (SEM DUPLICADOS)
// ================================================

// 1. Estatísticas para o Dashboard
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const [labs, hosp, empr, certs] = await Promise.all([
            Lab.countDocuments(),
            Hospital.countDocuments(),
            Empresa.countDocuments(),
            Certificate.countDocuments()
        ]);
        res.json({ labs, hospitais: hosp, empresas: empr, certificados: certs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Listagem de Laboratórios
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const { provincia, page = 1, ativo } = req.query;
        const limit = 10;
        let filtro = {};
        if (provincia) filtro.provincia = provincia;
        if (ativo) filtro.ativo = (ativo === 'true');

        const total = await Lab.countDocuments(filtro);
        const labs = await Lab.find(filtro).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
        res.json({ labs, pages: Math.ceil(total / limit), total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Criar Laboratório
app.post('/api/labs', authMiddleware, async (req, res) => {
    const apiKey = gerarApiKey();
    const lab = new Lab({ ...req.body, labId: 'LAB' + Date.now(), apiKey });
    await lab.save();
    res.json({ success: true, apiKey });
});

// 4. Rotas do Laboratório
app.get('/api/labs/me', labMiddleware, (req, res) => res.json(req.lab));
app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
    const certs = await Certificate.find({ emitidoPor: req.lab._id }).sort({ emitidoEm: -1 });
    res.json(certs);
});

// ================================================
// PÁGINAS (DASHBOARDS)
// ================================================
app.get('/ministerio', (req, res) => res.send('... (Teu código HTML de login do ministério) ...'));
app.get('/admin-dashboard', (req, res) => res.send('... (Teu código HTML do dashboard admin) ...'));
app.get('/lab-dashboard', (req, res) => res.send('... (Teu código HTML do dashboard laboratório) ...'));
app.get('/novo-laboratorio', (req, res) => res.send('... (Teu código HTML de criação de lab) ...'));

// =============================================
// INICIALIZAÇÃO
// =============================================
app.listen(PORT, () => console.log('✅ SNS Server Rodando na porta ' + PORT));
