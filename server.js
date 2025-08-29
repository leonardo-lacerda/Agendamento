const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080; // ⚠️ DISCLOUD USA PORTA 8080

// Middleware
app.use(cors());
app.use(express.json());

// Armazenamento em memória
let agendamentos = [];
let nextId = 1;

// Dados de exemplo
agendamentos = [
    {
        id: 1,
        nome: "João Silva",
        telefone: "(11) 99999-9999",
        email: "joao@email.com",
        servico: "Consulta Médica",
        data_agendamento: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        observacoes: "Primeira consulta",
        status: "agendado",
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
    }
];
nextId = 2;

// Utilitários
const formatDate = (date) => new Date(date).toISOString();

const validateAgendamento = (data) => {
    const required = ['nome', 'servico', 'data_agendamento'];
    const missing = required.filter(field => !data[field]);
    
    if (missing.length > 0) {
        throw new Error(`Campos obrigatórios: ${missing.join(', ')}`);
    }
    
    if (new Date(data.data_agendamento) < new Date()) {
        throw new Error('Data do agendamento deve ser futura');
    }
};

// ROTA RAIZ
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 API de Agendamentos na Discloud!',
        timestamp: new Date().toISOString(),
        platform: 'Discloud',
        endpoints: {
            'GET /': 'Esta página',
            'GET /status': 'Status da API',
            'GET /agendamentos': 'Listar agendamentos',
            'POST /agendamentos': 'Criar agendamento',
            'GET /agendamentos/:id': 'Buscar agendamento por ID',
            'PUT /agendamentos/:id': 'Atualizar agendamento',
            'DELETE /agendamentos/:id': 'Deletar agendamento',
            'GET /stats': 'Estatísticas',
            'GET /backup': 'Fazer backup',
            'POST /restore': 'Restaurar backup'
        }
    });
});

// 1. Listar agendamentos com filtros
app.get('/agendamentos', (req, res) => {
    try {
        const { status, data, nome, limite = '50' } = req.query;
        let resultado = [...agendamentos];

        if (status) {
            resultado = resultado.filter(a => a.status === status);
        }
        
        if (data) {
            resultado = resultado.filter(a => 
                new Date(a.data_agendamento).toDateString() === new Date(data).toDateString()
            );
        }
        
        if (nome) {
            resultado = resultado.filter(a => 
                a.nome.toLowerCase().includes(nome.toLowerCase())
            );
        }

        resultado.sort((a, b) => new Date(a.data_agendamento) - new Date(b.data_agendamento));
        resultado = resultado.slice(0, parseInt(limite));

        res.json({
            success: true,
            total: resultado.length,
            agendamentos: resultado
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 2. Buscar agendamento por ID
app.get('/agendamentos/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const agendamento = agendamentos.find(a => a.id === id);
        
        if (!agendamento) {
            return res.status(404).json({
                success: false,
                error: 'Agendamento não encontrado'
            });
        }

        res.json({
            success: true,
            agendamento
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 3. Criar novo agendamento
app.post('/agendamentos', (req, res) => {
    try {
        validateAgendamento(req.body);

        const novoAgendamento = {
            id: nextId++,
            nome: req.body.nome,
            telefone: req.body.telefone || null,
            email: req.body.email || null,
            servico: req.body.servico,
            data_agendamento: formatDate(req.body.data_agendamento),
            observacoes: req.body.observacoes || null,
            status: req.body.status || 'agendado',
            criado_em: formatDate(new Date()),
            atualizado_em: formatDate(new Date())
        };

        agendamentos.push(novoAgendamento);

        res.status(201).json({
            success: true,
            message: 'Agendamento criado com sucesso',
            agendamento: novoAgendamento
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 4. Atualizar agendamento
app.put('/agendamentos/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = agendamentos.findIndex(a => a.id === id);
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Agendamento não encontrado'
            });
        }

        if (req.body.data_agendamento) {
            validateAgendamento({
                ...agendamentos[index],
                ...req.body
            });
        }

        const agendamentoAtualizado = {
            ...agendamentos[index],
            ...req.body,
            atualizado_em: formatDate(new Date())
        };

        if (req.body.data_agendamento) {
            agendamentoAtualizado.data_agendamento = formatDate(req.body.data_agendamento);
        }

        agendamentos[index] = agendamentoAtualizado;

        res.json({
            success: true,
            message: 'Agendamento atualizado com sucesso',
            agendamento: agendamentoAtualizado
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 5. Deletar agendamento
app.delete('/agendamentos/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const index = agendamentos.findIndex(a => a.id === id);
        
        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Agendamento não encontrado'
            });
        }

        agendamentos.splice(index, 1);

        res.json({
            success: true,
            message: 'Agendamento deletado com sucesso'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 6. Fazer backup dos dados
app.get('/backup', (req, res) => {
    try {
        const backup = {
            timestamp: new Date().toISOString(),
            total_agendamentos: agendamentos.length,
            next_id: nextId,
            agendamentos: agendamentos
        };

        res.json({
            success: true,
            message: 'Backup criado com sucesso',
            backup
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 7. Restaurar dados do backup
app.post('/restore', (req, res) => {
    try {
        const { agendamentos: backupAgendamentos, next_id } = req.body;

        if (!Array.isArray(backupAgendamentos)) {
            throw new Error('Formato de backup inválido');
        }

        agendamentos = backupAgendamentos;
        nextId = next_id || (Math.max(...agendamentos.map(a => a.id), 0) + 1);

        res.json({
            success: true,
            message: 'Dados restaurados com sucesso',
            total_agendamentos: agendamentos.length
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 8. Status da API
app.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        platform: 'discloud',
        timestamp: new Date().toISOString(),
        total_agendamentos: agendamentos.length,
        memoria_usada: process.memoryUsage(),
        uptime: process.uptime()
    });
});

// 9. Limpar todos os agendamentos
app.delete('/limpar-tudo', (req, res) => {
    agendamentos = [];
    nextId = 1;
    
    res.json({
        success: true,
        message: 'Todos os agendamentos foram removidos'
    });
});

// 10. Estatísticas rápidas
app.get('/stats', (req, res) => {
    try {
        const stats = {
            total: agendamentos.length,
            por_status: {},
            proximos_7_dias: 0,
            hoje: 0
        };

        const hoje = new Date().toDateString();
        const em7dias = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        agendamentos.forEach(a => {
            stats.por_status[a.status] = (stats.por_status[a.status] || 0) + 1;
            
            if (new Date(a.data_agendamento).toDateString() === hoje) {
                stats.hoje++;
            }
            
            if (new Date(a.data_agendamento) <= em7dias && new Date(a.data_agendamento) >= new Date()) {
                stats.proximos_7_dias++;
            }
        });

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Middleware de erro 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado'
    });
});

// Iniciar servidor na porta 8080 (obrigatório para Discloud)
app.listen(PORT, () => {
    console.log(`🚀 API rodando na porta ${PORT}`);
    console.log(`📊 Discloud API ativa!`);
});