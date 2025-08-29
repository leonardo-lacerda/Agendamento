// api/index.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configuração do PostgreSQL (Railway)
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || 'postgresql://postgres:DWZhHXxFcwNVrtgRPGSCInJOLSNwPbNU@interchange.proxy.rlwy.net:12357/railway',
    ssl: {
        rejectUnauthorized: false // Railway requer SSL
    },
    max: 20, // Máximo de conexões no pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Inicializar tabela se não existir
const initDatabase = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(20),
                email VARCHAR(255),
                servico VARCHAR(255) NOT NULL,
                data_agendamento TIMESTAMP NOT NULL,
                observacoes TEXT,
                status VARCHAR(50) DEFAULT 'agendado',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Criar índices para melhor performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
            CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendamento);
            CREATE INDEX IF NOT EXISTS idx_agendamentos_nome ON agendamentos(nome);
        `);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

// Inicializar database na primeira execução
initDatabase();

// Utilitários
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
        message: '🚀 API de Agendamentos no Vercel!',
        timestamp: new Date().toISOString(),
        platform: 'Vercel',
        database: 'PostgreSQL',
        endpoints: {
            'GET /': 'Esta página',
            'GET /api/status': 'Status da API',
            'GET /api/agendamentos': 'Listar agendamentos',
            'POST /api/agendamentos': 'Criar agendamento',
            'GET /api/agendamentos/:id': 'Buscar agendamento por ID',
            'PUT /api/agendamentos/:id': 'Atualizar agendamento',
            'DELETE /api/agendamentos/:id': 'Deletar agendamento',
            'GET /api/stats': 'Estatísticas',
            'GET /api/backup': 'Fazer backup',
            'POST /api/restore': 'Restaurar backup'
        }
    });
});

// 1. Listar agendamentos com filtros
app.get('/api/agendamentos', async (req, res) => {
    try {
        const { status, data, nome, limite = '50' } = req.query;
        let query = 'SELECT * FROM agendamentos WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (data) {
            query += ` AND DATE(data_agendamento) = DATE($${paramIndex})`;
            params.push(data);
            paramIndex++;
        }
        
        if (nome) {
            query += ` AND nome ILIKE $${paramIndex}`;
            params.push(`%${nome}%`);
            paramIndex++;
        }

        query += ` ORDER BY data_agendamento ASC LIMIT $${paramIndex}`;
        params.push(parseInt(limite));

        const result = await pool.query(query, params);

        res.json({
            success: true,
            total: result.rows.length,
            agendamentos: result.rows
        });
    } catch (error) {
        console.error('Error listing agendamentos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 2. Buscar agendamento por ID
app.get('/api/agendamentos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.query('SELECT * FROM agendamentos WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Agendamento não encontrado'
            });
        }

        res.json({
            success: true,
            agendamento: result.rows[0]
        });
    } catch (error) {
        console.error('Error finding agendamento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 3. Criar novo agendamento
app.post('/api/agendamentos', async (req, res) => {
    try {
        validateAgendamento(req.body);

        const query = `
            INSERT INTO agendamentos (nome, telefone, email, servico, data_agendamento, observacoes, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        
        const values = [
            req.body.nome,
            req.body.telefone || null,
            req.body.email || null,
            req.body.servico,
            req.body.data_agendamento,
            req.body.observacoes || null,
            req.body.status || 'agendado'
        ];

        const result = await pool.query(query, values);

        res.status(201).json({
            success: true,
            message: 'Agendamento criado com sucesso',
            agendamento: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating agendamento:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 4. Atualizar agendamento
app.put('/api/agendamentos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        // Verificar se existe
        const existingResult = await pool.query('SELECT * FROM agendamentos WHERE id = $1', [id]);
        
        if (existingResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Agendamento não encontrado'
            });
        }

        // Validar dados se data_agendamento for fornecida
        if (req.body.data_agendamento) {
            validateAgendamento({
                ...existingResult.rows[0],
                ...req.body
            });
        }

        const fields = [];
        const values = [];
        let paramIndex = 1;

        // Construir query dinamicamente
        Object.keys(req.body).forEach(key => {
            if (key !== 'id' && key !== 'criado_em') {
                fields.push(`${key} = $${paramIndex}`);
                values.push(req.body[key]);
                paramIndex++;
            }
        });

        fields.push(`atualizado_em = $${paramIndex}`);
        values.push(new Date());
        paramIndex++;

        values.push(id); // ID para WHERE

        const query = `
            UPDATE agendamentos 
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Agendamento atualizado com sucesso',
            agendamento: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating agendamento:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 5. Deletar agendamento
app.delete('/api/agendamentos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.query('DELETE FROM agendamentos WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Agendamento não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Agendamento deletado com sucesso'
        });
    } catch (error) {
        console.error('Error deleting agendamento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 6. Fazer backup dos dados
app.get('/api/backup', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM agendamentos ORDER BY id');
        
        const backup = {
            timestamp: new Date().toISOString(),
            total_agendamentos: result.rows.length,
            agendamentos: result.rows
        };

        res.json({
            success: true,
            message: 'Backup criado com sucesso',
            backup
        });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 7. Restaurar dados do backup
app.post('/api/restore', async (req, res) => {
    try {
        const { agendamentos } = req.body;

        if (!Array.isArray(agendamentos)) {
            throw new Error('Formato de backup inválido');
        }

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Limpar dados existentes
            await client.query('TRUNCATE TABLE agendamentos RESTART IDENTITY');
            
            // Inserir dados do backup
            for (const agendamento of agendamentos) {
                await client.query(`
                    INSERT INTO agendamentos (nome, telefone, email, servico, data_agendamento, observacoes, status, criado_em, atualizado_em)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    agendamento.nome,
                    agendamento.telefone,
                    agendamento.email,
                    agendamento.servico,
                    agendamento.data_agendamento,
                    agendamento.observacoes,
                    agendamento.status,
                    agendamento.criado_em,
                    agendamento.atualizado_em
                ]);
            }
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: 'Dados restaurados com sucesso',
                total_agendamentos: agendamentos.length
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 8. Status da API
app.get('/api/status', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as total FROM agendamentos');
        const dbStatus = await pool.query('SELECT version()');
        
        res.json({
            success: true,
            status: 'online',
            platform: 'vercel',
            database: 'postgresql',
            db_version: dbStatus.rows[0].version,
            timestamp: new Date().toISOString(),
            total_agendamentos: parseInt(result.rows[0].total),
            memoria_usada: process.memoryUsage(),
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Error checking status:', error);
        res.status(500).json({
            success: false,
            status: 'error',
            error: error.message
        });
    }
});

// 9. Limpar todos os agendamentos
app.delete('/api/limpar-tudo', async (req, res) => {
    try {
        await pool.query('TRUNCATE TABLE agendamentos RESTART IDENTITY');
        
        res.json({
            success: true,
            message: 'Todos os agendamentos foram removidos'
        });
    } catch (error) {
        console.error('Error clearing all agendamentos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 10. Estatísticas rápidas
app.get('/api/stats', async (req, res) => {
    try {
        const totalResult = await pool.query('SELECT COUNT(*) as total FROM agendamentos');
        const statusResult = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM agendamentos 
            GROUP BY status
        `);
        const hojeResult = await pool.query(`
            SELECT COUNT(*) as hoje 
            FROM agendamentos 
            WHERE DATE(data_agendamento) = CURRENT_DATE
        `);
        const proximosResult = await pool.query(`
            SELECT COUNT(*) as proximos 
            FROM agendamentos 
            WHERE data_agendamento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        `);

        const stats = {
            total: parseInt(totalResult.rows[0].total),
            por_status: {},
            proximos_7_dias: parseInt(proximosResult.rows[0].proximos),
            hoje: parseInt(hojeResult.rows[0].hoje)
        };

        statusResult.rows.forEach(row => {
            stats.por_status[row.status] = parseInt(row.count);
        });

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error getting stats:', error);
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

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 API rodando na porta ${PORT}`);
        console.log(`📊 Vercel API ativa!`);
    });
}

module.exports = app;