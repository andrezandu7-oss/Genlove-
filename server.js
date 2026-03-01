// ============================================
// SNS - SISTEMA NACIONAL DE SAÚDE (VERSÃO 2.0)
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');  // 🔵 NOVO: para gerar API Keys
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
// 🔵 NOVO: FUNÇÃO AUXILIAR
// ============================================
function gerarApiKey() {
    return 'SNS-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

// ============================================
// MODELOS DE DADOS
// ============================================

// Modelo de Usuário (existente)
const userSchema = new mongoose.Schema({
    nome: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: 'admin' }
});

// 🔵 NOVO: Modelo de Laboratório
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
    ativo: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lab = mongoose.model('Lab', labSchema);  // 🔵 NOVO

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO (melhorado)
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

// ============================================
// ROTA PRINCIPAL - LOGIN (igual)
// ============================================
app.get('/', (req, res) => {
    res.send(` ... (mesmo HTML de antes) ... `);
});

// ============================================
// ROTA DO DASHBOARD (melhorada)
// ============================================
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - SNS</title>
    <style>
        body { font-family: Arial; margin: 0; display: flex; }
        .sidebar { 
            width: 250px; 
            background: #006633; 
            color: white; 
            height: 100vh; 
            padding: 20px;
            position: fixed;
        }
        .sidebar h2 { margin-bottom: 30px; }
        .sidebar a {
            display: block;
            color: white;
            text-decoration: none;
            padding: 10px;
            margin: 5px 0;
            border-radius: 5px;
        }
        .sidebar a:hover {
            background: #004d26;
        }
        .main { 
            margin-left: 290px; 
            padding: 30px; 
            flex: 1;
        }
        button { 
            background: #dc3545; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            cursor: pointer; 
        }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 20px; 
            margin-top: 20px; 
        }
        .stat-card { 
            background: #f5f5f5; 
            padding: 20px; 
            border-radius: 5px; 
            text-align: center; 
        }
        .stat-card h3 { 
            color: #666; 
            margin-bottom: 10px; 
        }
        .stat-card .value { 
            font-size: 24px; 
            font-weight: bold; 
            color: #006633; 
        }
        .btn-criar {
            background: #006633;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            background: white;
            border-radius: 5px;
            overflow: hidden;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        th {
            background: #006633;
            color: white;
            padding: 12px;
            text-align: left;
        }
        td {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            align-items: center;
            justify-content: center;
        }
        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            width: 400px;
        }
        .modal-content input,
        .modal-content select {
            width: 100%;
            padding: 8px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS</h2>
        <a href="#" onclick="mostrarSecao('dashboard')">📊 Dashboard</a>
        <a href="#" onclick="mostrarSecao('labs')">🏥 Laboratórios</a>
        <a href="#" onclick="mostrarSecao('certificados')">📋 Certificados</a>
        <button onclick="logout()" style="margin-top: 20px; background: #dc3545; width: 100%;">Sair</button>
    </div>
    
    <div class="main">
        <!-- Seção Dashboard -->
        <div id="secaoDashboard">
            <h1>Dashboard</h1>
            <div class="stats">
                <div class="stat-card">
                    <h3>Laboratórios</h3>
                    <div class="value" id="totalLabs">0</div>
                </div>
                <div class="stat-card">
                    <h3>Certificados</h3>
                    <div class="value" id="totalCerts">0</div>
                </div>
                <div class="stat-card">
                    <h3>Hoje</h3>
                    <div class="value" id="certsHoje">0</div>
                </div>
            </div>
        </div>
        
        <!-- Seção Laboratórios -->
        <div id="secaoLabs" style="display: none;">
            <h1>Laboratórios</h1>
            <button class="btn-criar" onclick="mostrarModalLab()">+ Novo Laboratório</button>
            <table id="tabelaLabs">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th>Província</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody id="labsBody"></tbody>
            </table>
        </div>
        
        <!-- Seção Certificados -->
        <div id="secaoCertificados" style="display: none;">
            <h1>Certificados</h1>
            <p>Em breve...</p>
        </div>
    </div>
    
    <!-- Modal Novo Laboratório -->
    <div id="modalLab" class="modal">
        <div class="modal-content">
            <h2>Novo Laboratório</h2>
            <input type="text" id="labNome" placeholder="Nome do laboratório">
            <select id="labTipo">
                <option value="laboratorio">Laboratório</option>
                <option value="hospital">Hospital</option>
                <option value="clinica">Clínica</option>
            </select>
            <input type="text" id="labProvincia" placeholder="Província">
            <input type="text" id="labMunicipio" placeholder="Município (opcional)">
            <input type="text" id="labEmail" placeholder="Email (opcional)">
            <button onclick="criarLaboratorio()" style="background: #006633; color: white; padding: 10px; width: 100%;">Criar</button>
            <button onclick="fecharModalLab()" style="margin-top: 10px;">Cancelar</button>
        </div>
    </div>

    <script>
        const token = localStorage.getItem('token');
        if (!token) window.location.href = '/';
        
        function mostrarSecao(secao) {
            document.getElementById('secaoDashboard').style.display = 'none';
            document.getElementById('secaoLabs').style.display = 'none';
            document.getElementById('secaoCertificados').style.display = 'none';
            
            if (secao === 'dashboard') document.getElementById('secaoDashboard').style.display = 'block';
            if (secao === 'labs') {
                document.getElementById('secaoLabs').style.display = 'block';
                carregarLaboratorios();
            }
            if (secao === 'certificados') document.getElementById('secaoCertificados').style.display = 'block';
        }
        
        function mostrarModalLab() {
            document.getElementById('modalLab').style.display = 'flex';
        }
        
        function fecharModalLab() {
            document.getElementById('modalLab').style.display = 'none';
        }
        
        async function criarLaboratorio() {
            const lab = {
                nome: document.getElementById('labNome').value,
                tipo: document.getElementById('labTipo').value,
                provincia: document.getElementById('labProvincia').value,
                municipio: document.getElementById('labMunicipio').value,
                email: document.getElementById('labEmail').value
            };
            
            const res = await fetch('/api/labs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(lab)
            });
            
            const data = await res.json();
            
            if (data.success) {
                alert('✅ Laboratório criado! API Key: ' + data.lab.apiKey);
                fecharModalLab();
                carregarLaboratorios();
            } else {
                alert('Erro: ' + data.erro);
            }
        }
        
        async function carregarLaboratorios() {
            const res = await fetch('/api/labs', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const labs = await res.json();
            
            const tbody = document.getElementById('labsBody');
            tbody.innerHTML = labs.map(lab => `
                <tr>
                    <td>${lab.labId || '-'}</td>
                    <td>${lab.nome}</td>
                    <td>${lab.tipo}</td>
                    <td>${lab.provincia}</td>
                    <td>${lab.ativo ? '✅ Ativo' : '❌ Inativo'}</td>
                    <td>
                        <button onclick="desativarLab('${lab._id}')">Desativar</button>
                    </td>
                </tr>
            `).join('');
        }
        
        async function desativarLab(id) {
            if (!confirm('Tem certeza?')) return;
            
            const res = await fetch('/api/labs/' + id, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            
            if (res.ok) {
                alert('Laboratório desativado');
                carregarLaboratorios();
            }
        }
        
        async function carregarStats() {
            const res = await fetch('/api/stats', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            document.getElementById('totalLabs').innerText = data.totalLabs || 0;
            document.getElementById('totalCerts').innerText = data.totalCertificados || 0;
            document.getElementById('certsHoje').innerText = data.certificadosHoje || 0;
        }
        
        carregarStats();
        
        function logout() {
            localStorage.removeItem('token');
            window.location.href = '/';
        }
    </script>
</body>
</html>
    `);
});

// ============================================
// API DE LOGIN (melhorada)
// ============================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Verificar se é o admin padrão
    if (email === 'admin@sns.gov.ao' && password === 'Admin@2025') {
        let user = await User.findOne({ email });
        
        if (!user) {
            const senhaHash = await bcrypt.hash(password, 10);
            user = await User.create({
                nome: 'Administrador',
                email,
                password: senhaHash,
                role: 'admin'
            });
        }
        
        const token = jwt.sign(
            { id: user._id, email, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '8h' }
        );
        
        res.json({ token, user: { nome: user.nome, email, role: user.role } });
    } else {
        res.status(401).json({ erro: 'Email ou senha incorretos' });
    }
});

// ============================================
// 🔵 NOVO: API DE LABORATÓRIOS
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
        
        res.json({
            success: true,
            lab: {
                labId: lab.labId,
                nome: lab.nome,
                apiKey: lab.apiKey
            }
        });
        
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao criar laboratório' });
    }
});

// Listar laboratórios
app.get('/api/labs', authMiddleware, async (req, res) => {
    try {
        const labs = await Lab.find({}, { apiKey: 0 }); // Não mostrar API Key
        res.json(labs);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar laboratórios' });
    }
});

// Desativar laboratório
app.delete('/api/labs/:id', authMiddleware, async (req, res) => {
    try {
        await Lab.findByIdAndUpdate(req.params.id, { ativo: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// API DE ESTATÍSTICAS (melhorada)
// ============================================
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        res.json({
            totalLabs: await Lab.countDocuments({ ativo: true }),
            totalCertificados: 0,
            certificadosHoje: 0
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno' });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SNS - Servidor iniciado (v2.0)');
    console.log('='.repeat(50));
    console.log(`📱 URL: http://localhost:${PORT}`);
    console.log(`👤 Login: admin@sns.gov.ao / Admin@2025`);
    console.log(`🏥 Laboratórios: funcionando`);
    console.log('='.repeat(50) + '\n');
});