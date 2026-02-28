// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - REPÚBLICA DE ANGOLA
// ============================================
// Módulo: Certificados Médicos Oficiais
// Versão: 1.0.0
// Data: 2025
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.URL_BASE || 'http://localhost:3000';

// ============================================
// CONFIGURAÇÕES DE SEGURANÇA
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.sns.gov.ao", "http://localhost:3000"],
        },
    },
}));

// Configuração CORS
const corsOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:3000'];

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-leitor-key']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: { erro: 'Muitas requisições. Tente novamente mais tarde.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_LOCAL || 'mongodb://localhost:27017/sns-angola';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado ao MongoDB - SNS Angola'))
.catch(err => {
    console.error('❌ Erro MongoDB:', err);
    process.exit(1);
});

// ============================================
// MODELOS DE DADOS
// ============================================

// Modelo de Laboratório/Instituição
const labSchema = new mongoose.Schema({
    labId: { type: String, required: true, unique: true },
    nome: { type: String, required: true },
    tipo: { 
        type: String, 
        enum: ['laboratorio', 'hospital', 'clinica', 'seguradora', 'ministerio', 'genlove', 'empresa'],
        required: true 
    },
    provincia: { type: String, required: true },
    municipio: String,
    endereco: String,
    email: String,
    telefone: String,
    diretor: String,
    
    // Autenticação
    apiKey: { type: String, unique: true },
    apiSecret: String,
    chaveDesencriptacao: { type: String, unique: true },
    
    // Permissões
    permissoes: {
        tiposCertificado: { type: [Number], default: [] },  // [1,2,3,4,5]
        camposVisiveis: { type: [String], default: [] },     // ['prenom', 'nom', 'genotipo', etc.]
        formatoEspecial: { type: String, default: 'completo' } // 'genlove' | 'completo' | 'restrito'
    },
    
    // Controlo
    ativo: { type: Boolean, default: true },
    emitidoEm: { type: Date, default: Date.now },
    expiraEm: { type: Date, default: () => new Date(+new Date() + 365*24*60*60*1000) },
    ultimoAcesso: Date,
    
    // Estatísticas
    totalEmissoes: { type: Number, default: 0 },
    totalConsultas: { type: Number, default: 0 },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Modelo de Utilizador do Ministério
const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['admin', 'inspetor', 'estatistico', 'suporte'],
        default: 'estatistico'
    },
    permissoes: [{ type: String }],
    ativo: { type: Boolean, default: true },
    ultimoLogin: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Modelo de Certificado
const certificateSchema = new mongoose.Schema({
    numero: { type: String, required: true, unique: true },
    tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5] },
    
    paciente: {
        nomeCompleto: { type: String, required: true },
        prenome: String,
        sobrenome: String,
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String,
        nif: String,
        telefone: String,
        provincia: String,
        municipio: String
    },
    
    dados: {
        // Tipo 1: Genótipo
        genotipo: { type: String, enum: ['AA', 'AS', 'SS'] },
        grupoSanguineo: String,
        hemoglobina: Number,
        
        // Tipo 2: Boa Saúde
        avaliacao: String,
        finalidade: [String],
        doencasInfecciosas: [String],
        
        // Tipo 3: Incapacidade
        periodoInicio: Date,
        periodoFim: Date,
        diasIncapacidade: Number,
        recomendacoes: [String],
        cid: String,
        
        // Tipo 4: Aptidão
        tipoAptidao: String,
        funcao: String,
        examesRealizados: [String],
        restricoes: [String],
        
        // Tipo 5: Materno
        obstetricos: {
            gestacoes: Number,
            partos: Number,
            cesarianas: Number,
            abortos: Number
        },
        gravidezAtual: {
            dpp: Date,
            ig: Number,
            consultas: Number
        },
        prevencao: {
            fansidar: [Date],
            vacinaTetano: [Date],
            ferro: Boolean,
            mosquiteiro: Boolean
        },
        exames: mongoose.Schema.Types.Mixed
    },
    
    dadosGenlove: String,  // Formato "prenom|nom|genero|genotipo|grupo"
    
    // Segurança
    qrCodeData: String,
    qrCodeImage: String,
    hashVerificacao: { type: String, unique: true },
    
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    tecnico: String,
    diretor: String,
    emitidoEm: { type: Date, default: Date.now },
    validoAte: Date,
    
    observacoes: String
}, { timestamps: true });

// Modelo de Log de Auditoria
const auditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    acao: { 
        type: String, 
        enum: ['EMISSAO', 'CONSULTA', 'VERIFICACAO', 'CRIACAO_LAB', 'ALTERACAO_LAB', 'LOGIN', 'LOGOUT', 'REVOGACAO']
    },
    labId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    certificadoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate' },
    tipoCertificado: Number,
    ip: String,
    userAgent: String,
    detalhes: mongoose.Schema.Types.Mixed,
    sucesso: { type: Boolean, default: true },
    erro: String
});

// Índices para performance
labSchema.index({ apiKey: 1 });
labSchema.index({ chaveDesencriptacao: 1 });
certificateSchema.index({ numero: 1 });
certificateSchema.index({ hashVerificacao: 1 });
certificateSchema.index({ emitidoEm: -1 });
certificateSchema.index({ 'paciente.bi': 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ labId: 1, timestamp: -1 });

// Middleware para extrair prenome/sobrenome
certificateSchema.pre('save', function(next) {
    if (this.paciente.nomeCompleto) {
        const partes = this.paciente.nomeCompleto.trim().split(' ');
        this.paciente.prenome = partes[0];
        this.paciente.sobrenome = partes.slice(1).join(' ');
    }
    next();
});

const Lab = mongoose.model('Lab', labSchema);
const User = mongoose.model('User', userSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// ============================================
// UTILITÁRIOS DE CRIPTOGRAFIA
// ============================================
const MASTER_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function cifrarDados(dados) {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_KEY, 'hex'), iv);
        let encrypted = cipher.update(JSON.stringify(dados), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        throw new Error('Erro ao cifrar dados: ' + error.message);
    }
}

function decifrarDados(dadosCifrados, chaveLeitor) {
    try {
        const [ivHex, encrypted] = dadosCifrados.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(chaveLeitor, 'hex'), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        throw new Error('Chave inválida ou dados corrompidos');
    }
}

function gerarChaveLeitor() {
    return crypto.randomBytes(32).toString('hex');
}

function gerarApiKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `SNS-${timestamp}-${random}`;
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `CERT-${tipo}-${ano}${mes}-${random}`;
}

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ erro: 'Token não fornecido' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
        const user = await User.findById(decoded.id);
        
        if (!user || !user.ativo) {
            return res.status(401).json({ erro: 'Utilizador não autorizado' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ erro: 'Token inválido' });
    }
};

const labAuthMiddleware = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ erro: 'API Key não fornecida' });
        }

        const lab = await Lab.findOne({ apiKey, ativo: true });
        if (!lab) {
            return res.status(401).json({ erro: 'API Key inválida' });
        }

        if (lab.expiraEm && new Date() > lab.expiraEm) {
            return res.status(401).json({ erro: 'API Key expirada' });
        }

        lab.ultimoAcesso = new Date();
        await lab.save();

        req.lab = lab;
        next();
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
};

const leitorAuthMiddleware = async (req, res, next) => {
    try {
        const chaveLeitor = req.headers['x-leitor-key'];
        if (!chaveLeitor) {
            return res.status(401).json({ erro: 'Chave do leitor não fornecida' });
        }

        const lab = await Lab.findOne({ chaveDesencriptacao: chaveLeitor, ativo: true });
        if (!lab) {
            return res.status(401).json({ erro: 'Chave inválida' });
        }

        if (lab.expiraEm && new Date() > lab.expiraEm) {
            return res.status(401).json({ erro: 'Chave expirada' });
        }

        req.leitor = lab;
        next();
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
};

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            await AuditLog.create({
                acao: 'LOGIN',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                sucesso: false,
                erro: 'Email não encontrado'
            });
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const senhaValida = await bcrypt.compare(password, user.password);
        if (!senhaValida) {
            await AuditLog.create({
                acao: 'LOGIN',
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                sucesso: false,
                erro: 'Senha incorreta'
            });
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        if (!user.ativo) {
            return res.status(401).json({ erro: 'Utilizador inativo' });
        }

        user.ultimoLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: process.env.JWT_EXPIRE || '8h' }
        );

        await AuditLog.create({
            acao: 'LOGIN',
            userId: user._id,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            sucesso: true
        });

        res.json({
            token,
            user: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ROTAS DE LABORATÓRIOS (Ministério)
// ============================================
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;

        // Validar campos obrigatórios
        if (!dados.nome || !dados.tipo || !dados.provincia) {
            return res.status(400).json({ 
                erro: 'Nome, tipo e província são obrigatórios' 
            });
        }

        // Gerar chaves
        const apiKey = gerarApiKey();
        const chaveDesencriptacao = gerarChaveLeitor();
        const labId = `LAB-${Date.now()}`;

        const lab = new Lab({
            ...dados,
            labId,
            apiKey,
            chaveDesencriptacao,
            createdBy: req.user._id
        });

        await lab.save();

        await AuditLog.create({
            acao: 'CRIACAO_LAB',
            userId: req.user._id,
            labId: lab._id,
            ip: req.ip,
            sucesso: true,
            detalhes: { labId: lab.labId, nome: lab.nome }
        });

        res.json({
            sucesso: true,
            lab: {
                labId: lab.labId,
                nome: lab.nome,
                apiKey: lab.apiKey,
                chaveDesencriptacao: lab.chaveDesencriptacao,
                permissoes: lab.permissoes,
                expiraEm: lab.expiraEm
            }
        });

    } catch (error) {
        console.error('Erro ao criar laboratório:', error);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({}, { 
            apiSecret: 0, 
            chaveDesencriptacao: 0,
            __v: 0 
        }).sort({ createdAt: -1 });
        
        res.json(labs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.get('/api/labs/:id', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id, { apiSecret: 0, __v: 0 });
        if (!lab) {
            return res.status(404).json({ erro: 'Laboratório não encontrado' });
        }
        res.json(lab);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.put('/api/labs/:id', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, select: { apiSecret: 0, chaveDesencriptacao: 0 } }
        );
        
        if (!lab) {
            return res.status(404).json({ erro: 'Laboratório não encontrado' });
        }

        await AuditLog.create({
            acao: 'ALTERACAO_LAB',
            userId: req.user._id,
            labId: lab._id,
            ip: req.ip,
            sucesso: true
        });

        res.json(lab);
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

app.post('/api/labs/:id/revogar', authMiddleware, async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ erro: 'Laboratório não encontrado' });
        }

        lab.ativo = false;
        await lab.save();

        await AuditLog.create({
            acao: 'REVOGACAO',
            userId: req.user._id,
            labId: lab._id,
            ip: req.ip,
            sucesso: true
        });

        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ROTAS DE CERTIFICADOS (Laboratórios)
// ============================================
app.post('/api/certificados/emitir/:tipo', labAuthMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const dados = req.body;

        // Validar tipo
        if (tipo < 1 || tipo > 5) {
            return res.status(400).json({ erro: 'Tipo de certificado inválido' });
        }

        // Validar permissão do laboratório
        if (!req.lab.permissoes?.tiposCertificado?.includes(tipo)) {
            return res.status(403).json({ 
                erro: 'Laboratório não tem permissão para este tipo de certificado' 
            });
        }

        // Validar dados do paciente
        if (!dados.paciente?.nomeCompleto || !dados.paciente?.genero || !dados.paciente?.dataNascimento) {
            return res.status(400).json({ 
                erro: 'Dados do paciente incompletos' 
            });
        }

        // Gerar número único
        const numero = gerarNumeroCertificado(tipo);

        // Calcular validade conforme tipo
        let validoAte = null;
        switch(tipo) {
            case 1: // Genótipo - vitalício
                validoAte = null; 
                break;
            case 2: // Boa Saúde - 6 meses
                validoAte = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); 
                break;
            case 3: // Incapacidade - até fim do período
                validoAte = dados.especificos?.periodoFim ? new Date(dados.especificos.periodoFim) : null; 
                break;
            case 4: // Aptidão - 1 ano
                validoAte = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); 
                break;
            case 5: // Materno - até parto
                validoAte = dados.especificos?.gravidezAtual?.dpp ? new Date(dados.especificos.gravidezAtual.dpp) : null; 
                break;
        }

        // Criar certificado
        const certificado = new Certificate({
            numero,
            tipo,
            paciente: dados.paciente,
            dados: dados.especificos || {},
            emitidoPor: req.lab._id,
            tecnico: dados.tecnico,
            diretor: dados.diretor,
            emitidoEm: new Date(),
            validoAte,
            observacoes: dados.observacoes
        });

        // Gerar dados para Genlove (formato simplificado)
        const genotipo = certificado.dados?.genotipo || '';
        const grupo = certificado.dados?.grupoSanguineo || '';
        const dadosGenlove = `${certificado.paciente.prenome}|${certificado.paciente.sobrenome}|${certificado.paciente.genero}|${genotipo}|${grupo}`;
        certificado.dadosGenlove = dadosGenlove;

        // Cifrar dados completos para o QR code
        const dadosCompletos = {
            numero: certificado.numero,
            tipo: certificado.tipo,
            paciente: certificado.paciente,
            dados: certificado.dados,
            emitidoPor: req.lab.nome,
            emitidoEm: certificado.emitidoEm,
            validoAte: certificado.validoAte
        };
        certificado.qrCodeData = cifrarDados(dadosCompletos);

        // Gerar QR code
        certificado.qrCodeImage = await QRCode.toDataURL(certificado.qrCodeData, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 300
        });

        // Hash de verificação
        certificado.hashVerificacao = crypto.createHash('sha256')
            .update(certificado.qrCodeData)
            .digest('hex');

        await certificado.save();

        // Atualizar estatísticas do laboratório
        req.lab.totalEmissoes += 1;
        req.lab.ultimoAcesso = new Date();
        await req.lab.save();

        // Log
        await AuditLog.create({
            acao: 'EMISSAO',
            labId: req.lab._id,
            certificadoId: certificado._id,
            tipoCertificado: tipo,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            sucesso: true
        });

        res.json({
            sucesso: true,
            certificado: {
                numero: certificado.numero,
                qrCode: certificado.qrCodeImage,
                dadosGenlove: certificado.dadosGenlove,
                validoAte: certificado.validoAte,
                hash: certificado.hashVerificacao
            }
        });

    } catch (error) {
        console.error('Erro na emissão:', error);
        res.status(500).json({ erro: 'Erro interno: ' + error.message });
    }
});

// ============================================
// ROTAS DE LEITURA (Leitores autorizados)
// ============================================
app.post('/api/ler', leitorAuthMiddleware, async (req, res) => {
    try {
        const { qrCodeData } = req.body;

        if (!qrCodeData) {
            return res.status(400).json({ erro: 'QR Code não fornecido' });
        }

        // Buscar certificado pelo hash
        const hash = crypto.createHash('sha256').update(qrCodeData).digest('hex');
        const certificado = await Certificate.findOne({ hashVerificacao: hash });

        if (!certificado) {
            return res.status(404).json({ erro: 'Certificado não encontrado' });
        }

        // Verificar permissão do leitor
        if (!req.leitor.permissoes?.tiposCertificado?.includes(certificado.tipo)) {
            return res.status(403).json({ 
                erro: 'Leitor não autorizado para este tipo de certificado' 
            });
        }

        // Decifrar dados com a chave do leitor
        let dadosDecifrados;
        try {
            dadosDecifrados = decifrarDados(qrCodeData, req.leitor.chaveDesencriptacao);
        } catch (error) {
            return res.status(403).json({ erro: 'Não foi possível decifrar os dados' });
        }

        // Filtrar dados conforme permissões
        let dadosFiltrados = {};

        // Formato especial para Genlove
        if (req.leitor.permissoes.formatoEspecial === 'genlove') {
            dadosFiltrados = {
                formatoGenlove: certificado.dadosGenlove,
                valido: certificado.validoAte ? new Date() < certificado.validoAte : true
            };
        } else {
            // Filtrar campos permitidos
            const camposPermitidos = req.leitor.permissoes.camposVisiveis || [];
            
            if (camposPermitidos.includes('*')) {
                // Acesso total
                dadosFiltrados = dadosDecifrados;
            } else {
                // Acesso restrito
                camposPermitidos.forEach(campo => {
                    if (campo.includes('.')) {
                        // Acesso a campos aninhados
                        const partes = campo.split('.');
                        let valor = dadosDecifrados;
                        for (const parte of partes) {
                            valor = valor?.[parte];
                        }
                        dadosFiltrados[campo] = valor;
                    } else {
                        dadosFiltrados[campo] = dadosDecifrados[campo];
                    }
                });
            }
        }

        // Log de consulta
        await AuditLog.create({
            acao: 'CONSULTA',
            labId: req.leitor._id,
            certificadoId: certificado._id,
            tipoCertificado: certificado.tipo,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            sucesso: true
        });

        res.json({
            sucesso: true,
            tipo: certificado.tipo,
            valido: certificado.validoAte ? new Date() < certificado.validoAte : true,
            dados: dadosFiltrados
        });

    } catch (error) {
        console.error('Erro na leitura:', error);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// VERIFICAÇÃO PÚBLICA
// ============================================
app.post('/api/verificar', limiter, async (req, res) => {
    try {
        const { qrCodeData, numero } = req.body;

        let certificado;

        if (qrCodeData) {
            const hash = crypto.createHash('sha256').update(qrCodeData).digest('hex');
            certificado = await Certificate.findOne({ hashVerificacao: hash });
        } else if (numero) {
            certificado = await Certificate.findOne({ numero });
        }

        if (!certificado) {
            return res.json({ 
                valido: false,
                mensagem: 'Certificado não encontrado no sistema'
            });
        }

        const valido = certificado.validoAte ? new Date() < certificado.validoAte : true;

        const lab = await Lab.findById(certificado.emitidoPor);

        res.json({
            valido,
            numero: certificado.numero,
            tipo: certificado.tipo,
            emitidoPor: lab?.nome || 'Desconhecido',
            emitidoEm: certificado.emitidoEm,
            validoAte: certificado.validoAte,
            mensagem: valido ? '✅ Certificado válido' : '❌ Certificado expirado'
        });

    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// ESTATÍSTICAS PARA O MINISTÉRIO
// ============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const stats = {
            totalLabs: await Lab.countDocuments({ ativo: true }),
            labsInativos: await Lab.countDocuments({ ativo: false }),
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
            certificadosPorProvincia: await Certificate.aggregate([
                { $match: { 'paciente.provincia': { $ne: null } } },
                { $group: { _id: '$paciente.provincia', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]),
            atividadesRecentes: await AuditLog.find()
                .sort({ timestamp: -1 })
                .limit(10)
                .populate('labId', 'nome')
                .populate('userId', 'nome')
        };

        res.json(stats);

    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// SERVIÇO DE FRONTEND
// ============================================

// Servir frontends estáticos
app.use('/ministerio', express.static(path.join(__dirname, 'public/ministerio')));
app.use('/lab', express.static(path.join(__dirname, 'public/lab')));
app.use('/verificar', express.static(path.join(__dirname, 'public/verificar')));

// Rotas para SPA (Single Page Applications)
app.get('/ministerio/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/ministerio/index.html'));
});

app.get('/lab/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/lab/index.html'));
});

app.get('/verificar/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/verificar/index.html'));
});

// Rota raiz - redireciona para a página principal
app.get('/', (req, res) => {
    res.redirect('/ministerio');
});

// ============================================
// CRIAÇÃO DO PRIMEIRO ADMIN (se necessário)
// ============================================
async function createFirstAdmin() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const senhaHash = await bcrypt.hash('Admin@2025', 10);
            const admin = new User({
                nome: 'Administrador SNS',
                email: 'admin@sns.gov.ao',
                password: senhaHash,
                role: 'admin',
                permissoes: ['*']
            });
            await admin.save();
            console.log('✅ Administrador criado:');
            console.log('   Email: admin@sns.gov.ao');
            console.log('   Senha: Admin@2025');
            console.log('   ⚠️  ALTERE A SENHA APÓS O PRIMEIRO LOGIN!');
        }
    } catch (error) {
        console.error('Erro ao criar admin:', error);
    }
}

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - SISTEMA NACIONAL DE SAÚDE');
    console.log('='.repeat(50));
    console.log(`📡 Servidor: http://localhost:${PORT}`);
    console.log(`🏛️  Ministério: http://localhost:${PORT}/ministerio`);
    console.log(`🔬 Laboratório: http://localhost:${PORT}/lab`);
    console.log(`🔍 Verificar: http://localhost:${PORT}/verificar`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    console.log('='.repeat(50) + '\n');

    await createFirstAdmin();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🔴 Encerrando servidor SNS...');
    await mongoose.connection.close();
    console.log('✅ Conexão MongoDB fechada');
    process.exit(0);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    console.error('❌ Erro não capturado:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Promise rejeitada não tratada:', err);
});

module.exports = app;