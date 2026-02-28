const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Page principale sans mot de passe
app.get('/ministerio', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>SNS Angola</title>
    <style>
        body {
            background: linear-gradient(135deg, #006633, #003300);
            color: white;
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 20px;
            max-width: 400px;
            width: 90%;
        }
        h1 { font-size: 3rem; margin-bottom: 0; }
        h2 { font-size: 1rem; opacity: 0.8; margin-bottom: 30px; }
        .btn {
            background: #ffcc00;
            color: #003300;
            border: none;
            padding: 15px 40px;
            font-size: 1.2rem;
            border-radius: 50px;
            cursor: pointer;
            font-weight: bold;
            margin: 20px 0;
            width: 100%;
        }
        .btn:hover { background: #ffd700; }
        .stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin: 30px 0;
        }
        .stat {
            background: rgba(255,255,255,0.2);
            padding: 15px;
            border-radius: 10px;
        }
        .stat-value { font-size: 1.8rem; font-weight: bold; color: #ffcc00; }
        .stat-label { font-size: 0.8rem; }
        .footer { margin-top: 30px; font-size: 0.8rem; opacity: 0.7; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SNS</h1>
        <h2>Sistema Nacional de Saúde - Angola</h2>
        
        <div style="background: #28a745; padding: 10px; border-radius: 30px; margin: 20px 0;">
            ✅ Servidor Online
        </div>
        
        <div class="stats">
            <div class="stat"><div class="stat-value">47</div><div class="stat-label">Laboratórios</div></div>
            <div class="stat"><div class="stat-value">15.234</div><div class="stat-label">Certificados</div></div>
            <div class="stat"><div class="stat-value">89</div><div class="stat-label">Hoje</div></div>
            <div class="stat"><div class="stat-value">100%</div><div class="stat-label">Ativo</div></div>
        </div>
        
        <button class="btn" onclick="entrar()">🔓 ENTRAR NO SISTEMA</button>
        
        <div class="footer">
            Ministério da Saúde - República de Angola<br>
            Versão 1.0 • 2025
        </div>
    </div>
    
    <script>
        function entrar() {
            window.location.href = '/dashboard';
        }
    </script>
</body>
</html>
    `);
});

// Dashboard après clic
app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard - SNS</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f0f2f5;
            display: flex;
        }
        .sidebar {
            width: 250px;
            background: linear-gradient(180deg, #006633, #003300);
            color: white;
            height: 100vh;
            padding: 20px 0;
        }
        .sidebar h2 { text-align: center; margin-bottom: 30px; }
        .sidebar a {
            display: block;
            color: rgba(255,255,255,0.8);
            text-decoration: none;
            padding: 15px 25px;
        }
        .sidebar a:hover { background: rgba(255,255,255,0.2); }
        .main {
            flex: 1;
            padding: 30px;
        }
        .cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-top: 20px;
        }
        .card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .card h3 { color: #666; margin: 0 0 10px 0; }
        .card .value { font-size: 2rem; font-weight: bold; color: #006633; }
        .btn-sair {
            background: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h2>SNS</h2>
        <a href="#" class="active">📊 Dashboard</a>
        <a href="#">🏥 Laboratórios</a>
        <a href="#">📋 Certificados</a>
        <a href="#">🔑 Chaves</a>
    </div>
    
    <div class="main">
        <h1>Dashboard</h1>
        <div class="cards">
            <div class="card"><h3>Laboratórios</h3><div class="value">47</div></div>
            <div class="card"><h3>Certificados Hoje</h3><div class="value">89</div></div>
            <div class="card"><h3>Total</h3><div class="value">15.234</div></div>
            <div class="card"><h3>Ativos</h3><div class="value">100%</div></div>
        </div>
        <p style="margin-top: 30px;">Bem-vindo ao sistema!</p>
        <button class="btn-sair" onclick="sair()">Sair</button>
    </div>
    
    <script>
        function sair() {
            window.location.href = '/ministerio';
        }
    </script>
</body>
</html>
    `);
});

// Route de test
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date() });
});

// Redirection racine
app.get('/', (req, res) => {
    res.redirect('/ministerio');
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`✅ SNS Angola rodando em http://localhost:${PORT}`);
});