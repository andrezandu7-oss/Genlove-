// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// FUNCIONALIDADES COMPLETAS
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.log('❌ MongoDB erro:', err));

// ============================================
// MODELOS DE DADOS
// ============================================

// Usuário do Ministério
const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['admin', 'inspetor', 'estatistico'],
        default: 'inspetor'
    },
    ativo: { type: Boolean, default: true },
    ultimoLogin: Date,
    createdAt: { type: Date, default: Date.now }
});

// Laboratório
const labSchema = new mongoose.Schema({
    labId: { type: String, unique: true },
    nome: { type: String, required: true },
    tipo: { 
        type: String, 
        enum: ['laboratorio', 'hospital', 'clinica'],
        required: true 
    },
    provincia: { type: String, required: true },
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
    totalEmissoes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    ultimoAcesso: Date
});

// Certificado
const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: { type: Number, required: true, enum: [1,2,3,4,5] },
    paciente: {
        nomeCompleto: { type: String, required: true },
        prenome: String,
        sobrenome: String,
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String,
        telefone: String,
        provincia: String
    },
    dados: {
        // Tipo 1: Genótipo
        genotipo: { type: String, enum: ['AA', 'AS', 'SS'] },
        grupoSanguineo: String,
        
        // Tipo 2: Boa Saúde
        avaliacao: String,
        finalidade: [String],
        
        // Tipo 3: Incapacidade
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        
        // Tipo 4: Aptidão
        tipoAptidao: String,
        restricoes: [String],
        
        // Tipo 5: Materno
        obstetricos: {
            gestacoes: Number,
            partos: Number
        },
        dpp: Date,
        ig: Number
    },
    dadosGenlove: String,
    qrCode: String,
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date
});

// Log de Auditoria
const logSchema = new mongoose.Schema({
    acao: String,
    usuario: String,
    laboratorio: String,
    certificado: String,
    ip: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const Log = mongoose.model('Log', logSchema);

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `CERT-${tipo}-${ano}${mes}-${random}`;
}

function calcularValidade(tipo, dados) {
    const hoje = new Date();
    switch(tipo) {
        case 1: return null; // Vitalício
        case 2: return new Date(hoje.setMonth(hoje.getMonth() + 6)); // 6 meses
        case 3: return dados.periodoFim ? new Date(dados.periodoFim) : null;
        case 4: return new Date(hoje.setFullYear(hoje.getFullYear() + 1)); // 1 ano
        case 5: return dados.dpp ? new Date(dados.dpp) : null; // Até parto
        default: return null;
    }
}

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================

const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ erro: 'Token não fornecido' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido' });
    }
};

const labMiddleware = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ erro: 'API Key não fornecida' });
    }
    
    const lab = await Lab.findOne({ apiKey, ativo: true });
    
    if (!lab) {
        return res.status(401).json({ erro: 'API Key inválida' });
    }
    
    req.lab = lab;
    next();
};

// ============================================
// ROTAS PÚBLICAS
// ============================================

// Página inicial (login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============================================
// API DE AUTENTICAÇÃO
// ============================================

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email, ativo: true });
        
        if (!user) {
            return res.status(401).json({ erro: 'Email não encontrado' });
        }
        
        const senhaValida = await bcrypt.compare(password, user.password);
        
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Senha incorreta' });
        }
        
        user.ultimoLogin = new Date();
        await user.save();
        
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '8h' }
        );
        
        res.json({
            token,
            user: {
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE LABORATÓRIOS (Ministério)
// ============================================

// Criar laboratório
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        
        const labId = 'LAB-' + Date.now();
        const apiKey = gerarApiKey();
        
        const lab = new Lab({
            ...dados,
            labId,
            apiKey
        });
        
        await lab.save();
        
        await Log.create({
            acao: 'CRIAR_LAB',
            usuario: req.user.email,
            laboratorio: lab.nome
        });
        
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
        res.status(500).json({ erro: 'Erro ao criar laboratório' });
    }
});

// Listar laboratórios
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({}, { apiKey: 0 });
        res.json(labs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar laboratórios' });
    }
});

// Desativar laboratório
app.delete('/api/labs/:id', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        
        if (!lab) {
            return res.status(404).json({ erro: 'Laboratório não encontrado' });
        }
        
        lab.ativo = false;
        await lab.save();
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE CERTIFICADOS (Laboratórios)
// ============================================

// Emitir certificado
app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;
        
        // Verificar permissão
        if (!req.lab.permissoes.tiposCertificado.includes(tipo)) {
            return res.status(403).json({ 
                erro: 'Laboratório não tem permissão para este tipo' 
            });
        }
        
        // Gerar número único
        const numero = gerarNumeroCertificado(tipo);
        
        // Extrair prenome/sobrenome para Genlove
        const partes = dados.paciente.nomeCompleto.split(' ');
        const prenome = partes[0];
        const sobrenome = partes.slice(1).join(' ');
        
        // Formato Genlove
        const dadosGenlove = `${prenome}|${sobrenome}|${dados.paciente.genero || ''}|${dados.dados.genotipo || ''}|${dados.dados.grupoSanguineo || ''}`;
        
        // Calcular validade
        const validoAte = calcularValidade(tipo, dados.dados);
        
        // Gerar hash único
        const hash = crypto.createHash('sha256')
            .update(numero + JSON.stringify(dados))
            .digest('hex');
        
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: {
                ...dados.paciente,
                prenome,
                sobrenome
            },
            dados: dados.dados,
            dadosGenlove,
            hash,
            emitidoPor: req.lab._id,
            validoAte
        });
        
        await certificado.save();
        
        // Atualizar contador do laboratório
        req.lab.totalEmissoes += 1;
        req.lab.ultimoAcesso = new Date();
        await req.lab.save();
        
        res.json({
            success: true,
            certificado: {
                numero: certificado.numero,
                dadosGenlove,
                hash,
                validoAte
            }
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: 'Erro ao emitir certificado' });
    }
});

// Buscar certificado por número
app.get('/api/certificados/:numero', async (req, res) => {
    try {
        const certificado = await Certificate.findOne({ numero: req.params.numero })
            .populate('emitidoPor', 'nome labId');
        
        if (!certificado) {
            return res.status(404).json({ erro: 'Certificado não encontrado' });
        }
        
        res.json(certificado);
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE VERIFICAÇÃO PÚBLICA
// ============================================

app.post('/api/verificar', async (req, res) => {
    try {
        const { numero, qrCode } = req.body;
        
        let certificado;
        
        if (numero) {
            certificado = await Certificate.findOne({ numero });
        } else if (qrCode) {
            certificado = await Certificate.findOne({ hash: qrCode });
        }
        
        if (!certificado) {
            return res.json({ 
                valido: false, 
                mensagem: 'Certificado não encontrado' 
            });
        }
        
        const valido = certificado.validoAte ? 
            new Date() < certificado.validoAte : true;
        
        const lab = await Lab.findById(certificado.emitidoPor);
        
        res.json({
            valido,
            numero: certificado.numero,
            tipo: certificado.tipo,
            emitidoPor: lab?.nome,
            emitidoEm: certificado.emitidoEm,
            validoAte: certificado.validoAte,
            mensagem: valido ? '✅ Certificado válido' : '❌ Certificado expirado'
        });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ESTATÍSTICAS
// ============================================

app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            totalCertificados: await Certificate.countDocuments(),
            certificadosHoje: await Certificate.countDocuments({
                emitidoEm: { $gte: hoje }
            }),
            certificadosPorTipo: {
                tipo1: await Certificate.countDocuments({ tipo: 1 }),
                tipo2: await Certificate.countDocuments({ tipo: 2 }),
                tipo3: await Certificate.countDocuments({ tipo: 3 }),
                tipo4: await Certificate.countDocuments({ tipo: 4 }),
                tipo5: await Certificate.countDocuments({ tipo: 5 })
            },
            labsPorProvincia: await Lab.aggregate([
                { $group: { _id: '$provincia', count: { $sum: 1 } } }
            ])
        };
        
        res.json(stats);
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// LOGS
// ============================================

app.get('/api/logs', authMiddleware, async (req, res) => {
    try {
        const logs = await Log.find().sort({ timestamp: -1 }).limit(50);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// INICIALIZAÇÃO
// ============================================

async function criarAdminInicial() {
    try {
        const adminExists = await User.findOne({ email: 'admin@sns.gov.ao' });
        
        if (!adminExists) {
            const senhaHash = await bcrypt.hash('Admin@2025', 10);
            await User.create({
                nome: 'Administrador SNS',
                email: 'admin@sns.gov.ao',
                password: senhaHash,
                role: 'admin'
            });
            console.log('✅ Admin criado: admin@sns.gov.ao');
        }
    } catch (error) {
        console.error('Erro ao criar admin:', error);
    }
}

app.listen(PORT, async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - FUNCIONALIDADES COMPLETAS');
    console.log('='.repeat(50));
    console.log(`📱 URL: http://localhost:${PORT}`);
    console.log(`👤 Login: admin@sns.gov.ao`);
    console.log('='.repeat(50) + '\n');
    
    await criarAdminInicial();
});