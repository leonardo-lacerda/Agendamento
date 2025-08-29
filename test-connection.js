// test-connection.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:DWZhHXxFcwNVrtgRPGSCInJOLSNwPbNU@interchange.proxy.rlwy.net:12357/railway',
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function testConnection() {
    try {
        console.log('🔄 Testando conexão com PostgreSQL...');
        
        // Teste básico de conexão
        const client = await pool.connect();
        console.log('✅ Conexão estabelecida com sucesso!');
        
        // Teste de query
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('📊 Dados do servidor:');
        console.log('   Hora atual:', result.rows[0].current_time);
        console.log('   Versão PostgreSQL:', result.rows[0].pg_version);
        
        // Criar tabela de teste
        console.log('\n🔄 Criando tabela de agendamentos...');
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
        console.log('✅ Tabela agendamentos criada/verificada!');
        
        // Criar índices
        console.log('🔄 Criando índices...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
            CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendamento);
            CREATE INDEX IF NOT EXISTS idx_agendamentos_nome ON agendamentos(nome);
        `);
        console.log('✅ Índices criados!');
        
        // Verificar se há dados
        const countResult = await client.query('SELECT COUNT(*) as total FROM agendamentos');
        console.log(`📈 Total de agendamentos existentes: ${countResult.rows[0].total}`);
        
        // Inserir dados de exemplo se a tabela estiver vazia
        if (countResult.rows[0].total === '0') {
            console.log('🔄 Inserindo dados de exemplo...');
            await client.query(`
                INSERT INTO agendamentos (nome, telefone, email, servico, data_agendamento, observacoes)
                VALUES 
                ('João Silva', '(11) 99999-9999', 'joao@email.com', 'Consulta Médica', NOW() + INTERVAL '1 day', 'Primeira consulta'),
                ('Maria Santos', '(11) 88888-8888', 'maria@email.com', 'Exame de Rotina', NOW() + INTERVAL '2 days', 'Exame anual')
            `);
            console.log('✅ Dados de exemplo inseridos!');
        }
        
        client.release();
        console.log('\n🎉 Teste concluído com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro na conexão:', error.message);
        console.error('📋 Detalhes:', error);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('💡 Dica: Verifique se o servidor PostgreSQL está rodando');
        } else if (error.code === 'ENOTFOUND') {
            console.error('💡 Dica: Verifique o hostname da conexão');
        } else if (error.message.includes('password')) {
            console.error('💡 Dica: Verifique as credenciais de acesso');
        }
    } finally {
        await pool.end();
    }
}

// Executar teste
testConnection();