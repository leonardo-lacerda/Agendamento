const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configuração do PostgreSQL - importação condicional
let pool = null;

const initializePool = async () => {
    if (!pool) {
        try {
            const { Pool } = require('pg');
            pool = new Pool({
                connectionString: process.env.POSTGRES_URL || 'postgresql://postgres:DWZhHXxFcwNVrtgRPGSCInJOLSNwPbNU@interchange.proxy.rlwy.net:12357/railway',
                ssl: {
                    rejectUnauthorized: false
                },
                max: 5, // Reduzido para serverless
                idleTimeoutMillis: 10000,
                connectionTimeoutMillis: 5000,
            });
            
            // Teste de conexão
            const client = await pool.connect();
            client.release();
            console.log('Database pool initialized');
            
        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    }
    return pool;
};

// Inicializar banco de dados
const initDatabase = async () => {
    try {
        const dbPool = await initializePool();
        const client = await dbPool.connect();
        
        try {
            await client.query(`
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
            
            // Criar índices
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
                CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendamento);
                CREATE INDEX IF NOT EXISTS idx_agendamentos_nome ON agendamentos(nome);
            `);
            
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database initialization error:', error);
        // Não fazer throw aqui para não quebrar a aplicação
    }
};

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

// Middleware para garantir pool inicializado
const ensurePool = async (req, res, next) => {
    try {
        if (!pool) {
            await initializePool();
        }
        next();
    } catch (error) {
        console.error('Pool initialization error:', error);
        return res.status(500).json({
            success: false,
            error: 'Database connection failed',
            details: error.message
        });
    }
};

// ROTA RAIZ
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 API de Agendamentos no Vercel!',
        timestamp: new Date().toISOString(),
        platform: 'Vercel',
        database: 'PostgreSQL (Railway)',
        version: '2.0.0',
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

// 8. Status da API (movido para cima para debugging)
app.get('/api/status', async (req, res) => {
    try {
        let dbStatus = 'disconnected';
        let totalAgendamentos = 0;
        let dbVersion = 'unknown';
        
        try {
            await initializePool();
            const client = await pool.connect();
            
            try {
                const result = await client.query('SELECT COUNT(*) as total FROM agendamentos');
                const versionResult = await client.query('SELECT version()');
                
                totalAgendamentos = parseInt(result.rows[0].total);
                dbVersion = versionResult.rows[0].version;
                dbStatus = 'connected';
            } finally {
                client.release();
            }
        } catch (dbError) {
            console.error('Database status check error:', dbError);
            dbStatus = `error: ${dbError.message}`;
        }
        
        res.json({
            success: true,
            status: 'online',
            platform: 'vercel',
            database: {
                status: dbStatus,
                version: dbVersion,
                total_agendamentos: totalAgendamentos
            },
            timestamp: new Date().toISOString(),
            memoria_usada: process.memoryUsage(),
            uptime: process.uptime(),
            env: {
                node_env: process.env.NODE_ENV,
                has_postgres_url: !!process.env.POSTGRES_URL
            }
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({
            success: false,
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Rota para inicializar database manualmente
app.post('/api/init-db', async (req, res) => {
    try {
        await initDatabase();
        res.json({
            success: true,
            message: 'Database initialized successfully'
        });
    } catch (error) {
        console.error('Manual DB init error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 1. Listar agendamentos com filtros
app.get('/api/agendamentos', ensurePool, async (req, res) => {
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

        const client = await pool.connect();
        try {
            const result = await client.query(query, params);
            
            res.json({
                success: true,
                total: result.rows.length,
                agendamentos: result.rows
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error listing agendamentos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 2. Buscar agendamento por ID
app.get('/api/agendamentos/:id', ensurePool, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID deve ser um número válido'
            });
        }
        
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM agendamentos WHERE id = $1', [id]);
            
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
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error finding agendamento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 3. Criar novo agendamento
app.post('/api/agendamentos', ensurePool, async (req, res) => {
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

        const client = await pool.connect();
        try {
            const result = await client.query(query, values);

            res.status(201).json({
                success: true,
                message: 'Agendamento criado com sucesso',
                agendamento: result.rows[0]
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating agendamento:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 4. Atualizar agendamento
app.put('/api/agendamentos/:id', ensurePool, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID deve ser um número válido'
            });
        }
        
        const client = await pool.connect();
        try {
            // Verificar se existe
            const existingResult = await client.query('SELECT * FROM agendamentos WHERE id = $1', [id]);
            
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

            const result = await client.query(query, values);

            res.json({
                success: true,
                message: 'Agendamento atualizado com sucesso',
                agendamento: result.rows[0]
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating agendamento:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// 5. Deletar agendamento
app.delete('/api/agendamentos/:id', ensurePool, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID deve ser um número válido'
            });
        }
        
        const client = await pool.connect();
        try {
            const result = await client.query('DELETE FROM agendamentos WHERE id = $1 RETURNING *', [id]);
            
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
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error deleting agendamento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 6. Fazer backup dos dados
app.get('/api/backup', ensurePool, async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM agendamentos ORDER BY id');
            
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
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 7. Restaurar dados do backup
app.post('/api/restore', ensurePool, async (req, res) => {
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
                    agendamento.criado_em || new Date(),
                    agendamento.atualizado_em || new Date()
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

// 9. Limpar todos os agendamentos
app.delete('/api/limpar-tudo', ensurePool, async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('TRUNCATE TABLE agendamentos RESTART IDENTITY');
            
            res.json({
                success: true,
                message: 'Todos os agendamentos foram removidos'
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error clearing all agendamentos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 10. Estatísticas rápidas
app.get('/api/stats', ensurePool, async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const totalResult = await client.query('SELECT COUNT(*) as total FROM agendamentos');
            const statusResult = await client.query(`
                SELECT status, COUNT(*) as count 
                FROM agendamentos 
                GROUP BY status
            `);
            const hojeResult = await client.query(`
                SELECT COUNT(*) as hoje 
                FROM agendamentos 
                WHERE DATE(data_agendamento) = CURRENT_DATE
            `);
            const proximosResult = await client.query(`
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
        } finally {
            client.release();
        }
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
        error: 'Endpoint não encontrado',
        path: req.originalUrl,
        method: req.method
    });
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
    });
});

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
        console.log(`🚀 API rodando na porta ${PORT}`);
        console.log(`📊 Inicializando database...`);
        try {
            await initDatabase();
            console.log('✅ Database inicializado!');
        } catch (error) {
            console.error('❌ Erro ao inicializar database:', error);
        }
    });
}

module.exports = app;