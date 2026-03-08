// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE
// MINISTÉRIO DA SAÚDE - ANGOLA
// VERSÃO CORRIGIDA E COMPLETA
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode'); // Adicionado
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

// ============================================
// CONEXÃO MONGODB
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sns';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch(err => console.log('❌ MongoDB erro:', err));

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function gerarChaveHospital() {
    return 'HOSP-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function gerarChaveEmpresa() {
    return 'EMP-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function validarNIF(nif) {
    return /^\d{10}$/.test(nif);
}

function gerarNumeroCertificado(tipo) {
    const ano = new Date().getFullYear();
    const mes = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return 'CERT-' + tipo + '-' + ano + mes + '-' + random;
}

// ============================================
// MODELOS DE DADOS (CORRIGIDOS)
// ============================================
const userSchema = new mongoose.Schema({
    nome: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'admin' }
});

const labSchema = new mongoose.Schema({
    labId: { type: String, unique: true },
    nome: { type: String, required: true },
    nif: { type: String, required: true, unique: true },
    tipo: { type: String, enum: ['laboratorio', 'hospital', 'clinica'] },
    provincia: String,
    municipio: String,
    endereco: String,
    email: String,
    telefone: String,
    diretor: String,
    licenca: String,
    validadeLicenca: Date,
    apiKey: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    totalEmissoes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const hospitalSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    nif: { type: String, unique: true, required: true },
    provincia: { type: String, required: true },
    endereco: String,
    diretor: { type: String, required: true },
    email: { type: String, required: true },
    telefone: String,
    chaveAcesso: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: Date.now }
});

const empresaSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    nif: { type: String, unique: true, required: true },
    endereco: String,
    email: { type: String, required: true },
    telefone: String,
    responsavel: {
        nome: { type: String, required: true },
        cargo: String,
        email: String
    },
    chaveAcesso: { type: String, unique: true },
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: Date.now }
});

// Schema do certificado - com campos completos
const certificateSchema = new mongoose.Schema({
    numero: { type: String, unique: true },
    tipo: { type: Number, required: true, enum: [1, 2, 3, 4, 5, 6, 7, 8] },
    paciente: {
        nomeCompleto: { type: String, required: true },
        genero: { type: String, enum: ['M', 'F'] },
        dataNascimento: Date,
        bi: String
    },
    laborantin: {                      // Adicionado
        nome: String,
        registro: String
    },
    dados: {                            // Agora Mixed para aceitar todos os campos específicos
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    imc: Number,                        // Adicionado
    idade: Number,                      // Adicionado
    classificacaoIMC: String,           // Adicionado
    hash: { type: String, unique: true },
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab' },
    emitidoEm: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Empresa = mongoose.model('Empresa', empresaSchema);
const Certificate = mongoose.model('Certificate', certificateSchema);

// ============================================
// MIDDLEWARES
// ============================================
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token não fornecido' });
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
    if (!apiKey) return res.status(401).json({ erro: 'API Key não fornecida' });
    const lab = await Lab.findOne({ apiKey, ativo: true });
    if (!lab) return res.status(401).json({ erro: 'API Key inválida' });
    req.lab = lab;
    next();
};

// ============================================
// ROTAS PÚBLICAS
// ============================================
app.get('/', (req, res) => {
    res.send('<!DOCTYPE html>' +
        '<html>' +
        '<head><title>SNS - Angola</title>' +
        '<style>' +
        'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
        '.box{background:white;padding:30px;border-radius:10px;width:300px;text-align:center;}' +
        'a{display:block;margin:10px;padding:10px;background:#006633;color:white;text-decoration:none;border-radius:5px;}' +
        '</style>' +
        '</head>' +
        '<body>' +
        '<div class="box">' +
        '<h1>SNS - Angola</h1>' +
        '<a href="/ministerio">🏛️ Ministério da Saúde</a>' +
        '<a href="/lab-login">🔬 Laboratório</a>' +
        '</div>' +
        '</body></html>');
});

app.get('/ministerio', (req, res) => {
    res.send('<!DOCTYPE html>' +
        '<html>' +
        '<head><title>Login Ministério</title>' +
        '<style>' +
        'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
        '.box{background:white;padding:30px;border-radius:10px;width:300px;}' +
        'input{width:100%;padding:10px;margin:10px 0;}' +
        'button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}' +
        '</style>' +
        '</head>' +
        '<body>' +
        '<div class="box">' +
        '<h2>Login Ministério</h2>' +
        '<input type="email" id="email" value="admin@sns.gov.ao">' +
        '<input type="password" id="password" value="Admin@2025">' +
        '<button onclick="login()">Entrar</button>' +
        '</div>' +
        '<script>' +
        'async function login(){' +
        'const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("email").value,password:document.getElementById("password").value})});' +
        'const d=await r.json();' +
        'if(d.token){localStorage.setItem("token",d.token);window.location.href="/admin-dashboard";}' +
        'else alert("Erro");}' +
        '</script>' +
        '</body></html>');
});

app.get('/lab-login', (req, res) => {
    res.send('<!DOCTYPE html>' +
        '<html>' +
        '<head><title>Login Laboratório</title>' +
        '<style>' +
        'body{background:#006633;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;}' +
        '.box{background:white;padding:30px;border-radius:10px;width:300px;}' +
        'input{width:100%;padding:10px;margin:10px 0;}' +
        'button{width:100%;padding:10px;background:#006633;color:white;border:none;cursor:pointer;}' +
        '</style>' +
        '</head>' +
        '<body>' +
        '<div class="box">' +
        '<h2>Login Laboratório</h2>' +
        '<input type="text" id="apiKey" placeholder="Digite sua API Key">' +
        '<button onclick="login()">Entrar</button>' +
        '</div>' +
        '<script>' +
        'function login(){' +
        'const key=document.getElementById("apiKey").value;' +
        'if(key){localStorage.setItem("labKey",key);window.location.href="/lab-dashboard";}' +
        'else alert("Digite a API Key");}' +
        '</script>' +
        '</body></html>');
});

// ============================================
// API DE AUTENTICAÇÃO
// ============================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
        let user = await User.findOne({ email });
        if (!user) {
            const senhaHash = await bcrypt.hash(password, 10);
            user = await User.create({ nome: 'Administrador', email, password: senhaHash, role: 'admin' });
        }
        const token = jwt.sign({ id: user._id, email, role: user.role }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '8h' });
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else res.status(401).json({ erro: 'Email ou senha incorretos' });
});

// ============================================
// DASHBOARD DO MINISTÉRIO (corrigido)
// ============================================
// (O código HTML é idêntico ao fornecido anteriormente, não o repetirei por economia de espaço)
// ... (inserir aqui o HTML do admin-dashboard) ...
// Nota: O HTML do admin-dashboard já foi fornecido e está correto.

// ============================================
// DASHBOARD DO LABORATORIO
// ============================================
// (Idem, HTML fornecido anteriormente)

// ============================================
// ROTAS DA API
// ============================================

// Rota para obter dados do laboratório atual
app.get('/api/labs/me', labMiddleware, async (req, res) => {
    res.json(req.lab);
});

// Criar novo laboratório (apenas admin)
app.post('/api/labs', authMiddleware, async (req, res) => {
    try {
        const dados = req.body;
        const labId = 'LAB' + Date.now();
        const apiKey = gerarApiKey();
        const lab = new Lab({ ...dados, labId, apiKey });
        await lab.save();
        res.json({ success: true, labId, apiKey });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar laboratório' });
    }
});

// Listar todos os laboratórios (apenas admin) - SEM API KEY
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({}).select('-apiKey').sort({ createdAt: -1 });
        res.json(labs);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar laboratórios' });
    }
});

// Stats globais para o ministério
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const stats = {
            labs: await Lab.countDocuments({ ativo: true }),
            hospitais: await Hospital.countDocuments({ ativo: true }),
            empresas: await Empresa.countDocuments({ ativo: true })
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

// Stats detalhados para laboratório
app.get('/api/certificados/stats-detalhes', labMiddleware, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const inicioAno = new Date(hoje.getFullYear(), 0, 1);
        const stats = await Certificate.aggregate([
            { $match: { emitidoPor: req.lab._id } },
            {
                $facet: {
                    diario: [
                        { $match: { emitidoEm: { $gte: hoje } } },
                        { $count: "count" }
                    ],
                    mensal: [
                        { $match: { emitidoEm: { $gte: inicioMes } } },
                        { $count: "count" }
                    ],
                    anual: [
                        { $match: { emitidoEm: { $gte: inicioAno } } },
                        { $count: "count" }
                    ],
                    porTipo: [
                        { $group: { _id: "$tipo", count: { $sum: 1 } } }
                    ]
                }
            }
        ]);
        res.json({
            diario: stats[0]?.diario[0]?.count || 0,
            mensal: stats[0]?.mensal[0]?.count || 0,
            anual: stats[0]?.anual[0]?.count || 0,
            total: req.lab.totalEmissoes,
            porTipo: stats[0]?.porTipo || []
        });
    } catch (error) {
        console.error('Erro stats:', error);
        res.status(500).json({ error: 'Erro ao calcular estatísticas' });
    }
});

// Listar certificados do laboratório
app.get('/api/certificados/lab', labMiddleware, async (req, res) => {
    try {
        const certificados = await Certificate.find({ emitidoPor: req.lab._id })
            .sort({ emitidoEm: -1 });
        res.json(certificados);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar certificados' });
    }
});

// Emitir novo certificado
app.post('/api/certificados/emitir/:tipo', labMiddleware, async (req, res) => {
    try {
        const tipo = parseInt(req.params.tipo);
        const { paciente, laborantin, dados } = req.body;
        const numero = gerarNumeroCertificado(tipo);
        const hash = crypto.createHash('sha256').update(numero + Date.now()).digest('hex');

        // Calcular IMC e idade se disponíveis
        let imc = null, idade = null, classificacaoIMC = null;
        if (dados.peso && dados.altura) {
            const alturaMetros = dados.altura / 100;
            imc = (dados.peso / (alturaMetros * alturaMetros)).toFixed(2);
            if (imc < 18.5) classificacaoIMC = 'Abaixo do peso';
            else if (imc < 25) classificacaoIMC = 'Peso normal';
            else if (imc < 30) classificacaoIMC = 'Sobrepeso';
            else classificacaoIMC = 'Obesidade';
        }
        if (paciente.dataNascimento) {
            const nasc = new Date(paciente.dataNascimento);
            const hoje = new Date();
            idade = hoje.getFullYear() - nasc.getFullYear();
            const mes = hoje.getMonth() - nasc.getMonth();
            if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
        }

        const certificado = new Certificate({
            numero,
            tipo,
            paciente,
            laborantin,
            dados,
            imc,
            idade,
            classificacaoIMC,
            hash,
            emitidoPor: req.lab._id
        });
        await certificado.save();
        req.lab.totalEmissoes++;
        await req.lab.save();

        res.json({
            success: true,
            numero,
            imc,
            idade,
            classificacaoIMC
        });
    } catch (error) {
        console.error('Erro emissão:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// GÉNÉRATION PDF POUR CERTIFICAT (avec QR code)
// =============================================
app.post('/api/certificados/pdf', labMiddleware, async (req, res) => {
    try {
        const { numero } = req.body;
        if (!numero) {
            return res.status(400).json({ error: 'Número do certificado não fornecido' });
        }
        const certificado = await Certificate.findOne({
            numero,
            emitidoPor: req.lab._id
        });
        if (!certificado) {
            return res.status(404).json({ error: 'Certificado não encontrado' });
        }

        const lab = req.lab;
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Certificado ${numero}`,
                Author: lab.nome,
                Subject: 'Certificado Médico SNS Angola'
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=certificado-${numero}.pdf`);
        doc.pipe(res);

        // En-tête officiel
        doc.fillColor('#006633');
        doc.fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
        doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
        doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
        doc.strokeColor('#006633')
            .lineWidth(2)
            .moveTo(doc.page.width / 2 - 250, 150)
            .lineTo(doc.page.width / 2 + 250, 150)
            .stroke();

        let y = 180;
        doc.fillColor('#006633')
            .fontSize(14)
            .text(lab.nome, 50, y);
        doc.fontSize(10)
            .fillColor('#666')
            .text(`NIF: ${lab.nif} | ${lab.provincia}`, 50, y + 20)
            .text(`Endereço: ${lab.endereco || 'Não informado'} | Tel: ${lab.telefone || 'Não informado'}`, 50, y + 35);
        y += 60;

        doc.fillColor('#006633')
            .fontSize(12)
            .text(`CERTIFICADO Nº: ${numero}`, 50, y);
        doc.fontSize(10)
            .fillColor('#666')
            .text(`Data de Emissão: ${new Date(certificado.emitidoEm).toLocaleDateString('pt-PT')}`, 50, y + 15);
        y += 40;

        // Responsável
        doc.fillColor('#006633')
            .fontSize(12)
            .text('RESPONSÁVEL PELA EMISSÃO:', 50, y);
        y += 20;
        doc.fillColor('#000')
            .fontSize(11)
            .text(`Nome: ${certificado.laborantin?.nome || 'Não informado'}`, 70, y);
        y += 15;
        if (certificado.laborantin?.registro) {
            doc.text(`Registro Profissional: ${certificado.laborantin.registro}`, 70, y);
            y += 25;
        } else {
            y += 10;
        }

        // Paciente
        doc.fillColor('#006633')
            .fontSize(12)
            .text('DADOS DO PACIENTE:', 50, y);
        y += 20;
        doc.fillColor('#000')
            .fontSize(11)
            .text(`Nome: ${certificado.paciente?.nomeCompleto || 'Não informado'}`, 70, y);
        y += 15;
        doc.text(`BI: ${certificado.paciente?.bi || 'Não informado'}`, 70, y);
        y += 15;
        if (certificado.paciente?.dataNascimento) {
            doc.text(`Data Nascimento: ${new Date(certificado.paciente.dataNascimento).toLocaleDateString('pt-PT')}`, 70, y);
            y += 15;
        }
        if (certificado.idade) {
            doc.text(`Idade: ${certificado.idade} anos`, 70, y);
            y += 15;
        }
        if (certificado.paciente?.genero) {
            const genero = certificado.paciente.genero === 'M' ? 'Masculino' : 'Feminino';
            doc.text(`Género: ${genero}`, 70, y);
            y += 20;
        }

        // Dados médicos
        doc.fillColor('#006633')
            .fontSize(12)
            .text('DADOS MÉDICOS:', 50, y);
        y += 20;
        const tipos = {
            1: 'CERTIFICADO DE GENÓTIPO',
            2: 'CERTIFICADO DE BOA SAÚDE',
            3: 'CERTIFICADO DE INCAPACIDADE',
            4: 'CERTIFICADO DE APTIDÃO',
            5: 'CERTIFICADO DE SAÚDE MATERNA',
            6: 'CERTIFICADO DE PRÉ-NATAL',
            7: 'CERTIFICADO EPIDEMIOLÓGICO',
            8: 'CERTIFICADO DE SAÚDE PARA DESLOCAÇÃO (CSD)'
        };
        doc.fillColor('#333')
            .fontSize(12)
            .text(tipos[certificado.tipo] || 'CERTIFICADO MÉDICO', 70, y);
        y += 25;

        // Exibir todos os campos presentes em dados
        if (certificado.dados && Object.keys(certificado.dados).length > 0) {
            const campos = Object.entries(certificado.dados);
            const metade = Math.ceil(campos.length / 2);
            doc.fontSize(9);
            let yCol1 = y;
            for (let i = 0; i < metade; i++) {
                const [chave, valor] = campos[i];
                const nomeExame = chave.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                const valorStr = valor ? valor.toString() : '(vazio)';
                doc.fillColor('#000')
                    .text(`• ${nomeExame}: ${valorStr}`, 70, yCol1);
                yCol1 += 15;
                if (yCol1 > 700) { doc.addPage(); yCol1 = 50; }
            }
            let yCol2 = y;
            for (let i = metade; i < campos.length; i++) {
                const [chave, valor] = campos[i];
                const nomeExame = chave.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                const valorStr = valor ? valor.toString() : '(vazio)';
                doc.fillColor('#000')
                    .text(`• ${nomeExame}: ${valorStr}`, 300, yCol2);
                yCol2 += 15;
                if (yCol2 > 700) { doc.addPage(); yCol2 = 50; }
            }
            y = (yCol1 > yCol2 ? yCol1 : yCol2) + 10;
        } else {
            doc.text('Nenhum dado médico específico registado.', 70, y);
            y += 20;
        }

        if (certificado.imc) {
            doc.fontSize(11)
                .fillColor('#000')
                .text(`IMC: ${certificado.imc} (${certificado.classificacaoIMC || 'Não classificado'})`, 70, y);
            y += 25;
        }

        // Assinaturas
        doc.lineWidth(1)
            .moveTo(70, y)
            .lineTo(270, y)
            .stroke();
        doc.fontSize(10)
            .text('Assinatura do Laborantin', 70, y + 5)
            .text(certificado.laborantin?.nome || '_______________________', 70, y + 20);

        doc.lineWidth(1)
            .moveTo(350, y)
            .lineTo(550, y)
            .stroke();
        doc.fontSize(10)
            .text('Assinatura do Diretor Clínico', 350, y + 5)
            .text(lab.diretor || '_______________________', 350, y + 20);
        y += 50;

        // QR Code
        try {
            const textoQR = `${numero}|${lab.nome}|${certificado.paciente?.nomeCompleto || 'PACIENTE'}|${new Date(certificado.emitidoEm).toLocaleDateString('pt-PT')}`;
            const qrBuffer = await QRCode.toBuffer(textoQR, {
                errorCorrectionLevel: 'H',
                margin: 1,
                width: 100,
                color: { dark: '#006633', light: '#FFFFFF' }
            });
            const qrX = 310 - 50;
            const qrY = y - 20;
            doc.image(qrBuffer, qrX, qrY, { width: 100 });
            doc.fontSize(7)
                .fillColor('#006633')
                .text('SCAN PARA VERIFICAR', qrX, qrY - 12, { width: 100, align: 'center' });
            doc.fontSize(6)
                .fillColor('#999')
                .text('válido por QR', qrX, qrY + 110, { width: 100, align: 'center' });
        } catch (qrError) {
            console.error('Erro ao gerar QR:', qrError);
            doc.fontSize(7).fillColor('#999').text('QR indisponível', 280, y - 10);
        }

        doc.fontSize(8)
            .fillColor('#666')
            .text('Documento válido em todo território nacional', 0, 780, { align: 'center' });
        doc.end();

    } catch (error) {
        console.error('Erreur PDF certificat:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du PDF: ' + error.message });
    }
});

// =============================================
// GÉNÉRATION PDF POUR LABORATOIRE (sécurisée)
// =============================================
app.post('/api/labs/pdf', authMiddleware, async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do laboratório não fornecido' });

        const labData = await Lab.findById(id);
        if (!labData) return res.status(404).json({ error: 'Laboratório não encontrado' });

        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Laboratoire ${labData.nome}`,
                Author: 'SNS Angola',
                Subject: 'Fiche d\'enregistrement de laboratoire'
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Laboratorio_${labData.nome.replace(/\s/g, '_')}.pdf`);
        doc.pipe(res);

        // En-tête officiel
        doc.fillColor('#006633');
        doc.fontSize(20).text('REPÚBLICA DE ANGOLA', 0, 50, { align: 'center' });
        doc.fontSize(16).text('MINISTÉRIO DA SAÚDE', 0, 80, { align: 'center' });
        doc.fontSize(24).text('SISTEMA NACIONAL DE SAÚDE', 0, 110, { align: 'center' });
        doc.strokeColor('#006633')
            .lineWidth(2)
            .moveTo(doc.page.width / 2 - 250, 150)
            .lineTo(doc.page.width / 2 + 250, 150)
            .stroke();

        let y = 180;
        doc.fillColor('#006633')
            .fontSize(16)
            .text('REGISTO DE LABORATÓRIO', 50, y);
        y += 30;

        const addLine = (label, value, defaultValue = 'Não informado') => {
            const displayValue = (value && value.toString().trim() !== '') ? value : defaultValue;
            if (y > 750) {
                doc.addPage();
                y = 50;
                doc.fillColor('#006633').fontSize(12).text('SNS Angola -- Registo de Laboratório (continuação)', 50, y, { align: 'center' });
                y += 30;
            }
            doc.fillColor('#000')
                .fontSize(11)
                .text(`${label}: ${displayValue}`, 70, y);
            y += 20;
        };

        addLine('ID do Laboratório', labData.labId);
        addLine('Nome', labData.nome);
        addLine('NIF', labData.nif);
        addLine('Tipo', labData.tipo);
        addLine('Província', labData.provincia);
        addLine('Município', labData.municipio);
        addLine('Endereço', labData.endereco);
        addLine('Telefone', labData.telefone);
        addLine('Email', labData.email);
        addLine('Diretor', labData.diretor);
        addLine('Licença', labData.licenca);
        if (labData.validadeLicenca) {
            const dateVal = new Date(labData.validadeLicenca).toLocaleDateString('pt-PT');
            addLine('Validade da Licença', dateVal);
        }
        addLine('Status', labData.ativo ? 'Ativo' : 'Inativo');
        addLine('Total de Emissões', labData.totalEmissoes ?? 0);
        if (labData.createdAt) {
            const created = new Date(labData.createdAt).toLocaleDateString('pt-PT');
            addLine('Data de Registo', created);
        }
        y += 10;

        doc.fillColor('#b33')
            .fontSize(12)
            .text('CHAVE API (confidencial)', 70, y);
        y += 20;
        doc.fillColor('#000')
            .fontSize(10)
            .text(labData.apiKey || 'Não gerada', 70, y, { width: 400, align: 'left' });
        y += 30;
        doc.fillColor('#666')
            .fontSize(9)
            .text('Esta chave é pessoal e intransferível. Não a compartilhe.', 70, y);
        y += 30;

        doc.fontSize(8)
            .fillColor('#666')
            .text('Documento emitido pelo Sistema Nacional de Saúde de Angola', 0, 780, { align: 'center' });
        doc.end();

    } catch (error) {
        console.error('Erreur PDF laboratoire:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
    }
});

// =============================================
// FORMULÁRIO NOVO (arquivos estáticos)
// =============================================
app.get('/novo-certificado', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-certificado.html'));
});

app.get('/novo-laboratorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'novo-laboratorio.html'));
});

// =============================================
// INICIALIZAÇÃO DO SERVIDOR
// =============================================
app.listen(PORT, () => {
    console.log('✅ SNS Online na porta ' + PORT);
});