// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÕES
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.log('❌ MongoDB erro:', err));

// ============================================
// MODELOS DE DADOS (sem senhas)
// ============================================

// Modelo de Usuário (as senhas serão adicionadas depois)
const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // SENHA SERÁ ADICIONADA DEPOIS
    role: { type: String, enum: ['admin', 'inspetor', 'estatistico'], default: 'inspetor' },
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: Date.now }
});

// Modelo de Laboratório
const labSchema = new mongoose.Schema({
    labId: { type: String, unique: true },
    nome: { type: String, required: true },
    tipo: { type: String, enum: ['laboratorio', 'hospital', 'clinica'] },
    provincia: String,
    municipio: String,
    endereco: String,
    email: String,
    telefone: String,
    diretor: String,
    apiKey: { type: String, unique: true },
    permissoes: {
        tiposCertificado: { type: [Number], default: [1,2,3,4,5] }
    },
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: Date.now }
});

// Modelo de Certificado
const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: { type: Number, enum: [1,2,3,4,5] },
    paciente: {
        nomeCompleto: String,
        bi: String,
        dataNascimento: Date,
        genero: String
    },
    dados: mongoose.Schema.Types.Mixed,
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date,
    hash: String
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ============================================
// ROTAS PÚBLICAS
// ============================================

// Página de login (frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Página do dashboard (protegida)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============================================
// API DE AUTENTICAÇÃO (sem senhas por enquanto)
// ============================================
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // POR ENQUANTO: retorno simulado
    // AS SENHAS SERÃO ADICIONADAS DEPOIS
    if (email.includes('@')) {
        const token = jwt.sign(
            { email, role: 'admin' },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: '8h' }
        );
        
        res.json({
            success: true,
            token,
            user: { email, nome: 'Usuário Teste', role: 'admin' }
        });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

// Verificação de token
app.get('/api/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        res.json({ valid: true, user: decoded });
    } catch (err) {
        res.status(401).json({ valid: false, error: 'Token inválido' });
    }
});

// ============================================
// API DE LABORATÓRIOS
// ============================================

// Criar laboratório (gera API Key automática)
app.post('/api/labs', async (req, res) => {
    try {
        const labData = req.body;
        
        // Gerar ID único e API Key
        const labId = 'LAB-' + Date.now();
        const apiKey = 'SNS-' + Date.now() + '-' + Math.random().toString(36).substring(7).toUpperCase();
        
        const lab = new Lab({
            ...labData,
            labId,
            apiKey
        });
        
        await lab.save();
        
        res.json({
            success: true,
            lab: {
                labId: lab.labId,
                nome: lab.nome,
                apiKey: lab.apiKey,
                permissoes: lab.permissoes
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar laboratório' });
    }
});

// Listar laboratórios
app.get('/api/labs', async (req, res) => {
    try {
        const labs = await Lab.find({}, { apiKey: 0 });
        res.json(labs);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar laboratórios' });
    }
});

// ============================================
// API DE CERTIFICADOS
// ============================================

// Gerar novo certificado
app.post('/api/certificados', async (req, res) => {
    try {
        const dados = req.body;
        const apiKey = req.headers['x-api-key'];
        
        // Buscar laboratório pela API Key
        const lab = await Lab.findOne({ apiKey });
        
        if (!lab) {
            return res.status(401).json({ error: 'API Key inválida' });
        }
        
        // Gerar número único do certificado
        const numero = 'CERT-' + Date.now() + '-' + Math.random().toString(36).substring(7).toUpperCase();
        
        const certificado = new Certificate({
            ...dados,
            numero,
            emitidoPor: lab._id
        });
        
        // Gerar hash simples (para verificação)
        certificado.hash = require('crypto')
            .createHash('sha256')
            .update(numero + JSON.stringify(dados))
            .digest('hex');
        
        await certificado.save();
        
        res.json({
            success: true,
            certificado: {
                numero: certificado.numero,
                hash: certificado.hash,
                emitidoEm: certificado.emitidoEm
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar certificado' });
    }
});

// Buscar certificado por número
app.get('/api/certificados/:numero', async (req, res) => {
    try {
        const certificado = await Certificate.findOne({ numero: req.params.numero })
            .populate('emitidoPor', 'nome labId');
        
        if (!certificado) {
            return res.status(404).json({ error: 'Certificado não encontrado' });
        }
        
        res.json(certificado);
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar certificado' });
    }
});

// ============================================
// ESTATÍSTICAS
// ============================================
app.get('/api/stats', async (req, res) => {
    try {
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            totalCertificados: await Certificate.countDocuments(),
            certificadosHoje: await Certificate.countDocuments({
                emitidoEm: { $gte: new Date().setHours(0,0,0,0) }
            })
        };
        
        res.json(stats);
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log(`📡 Servidor: http://localhost:${PORT}`);
    console.log(`🔧 Modo: ${process.env.NODE_ENV || 'desenvolvimento'}`);
    console.log('='.repeat(50) + '\n');
    
    console.log('📌 NOTA: As senhas serão implementadas depois');
    console.log('📌 Por enquanto, o login aceita qualquer email\n');
});