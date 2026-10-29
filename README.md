# 🛡️ FaceID Access - Sistema de Reconhecimento Facial com Supabase

Projeto acadêmico de autenticação biométrica facial em tempo real com **React**, **TypeScript**, **Vite** e persistência em nuvem com **Supabase (PostgreSQL + Row-Level Security)**.

---

## 🚀 Tecnologias Utilizadas

- **Frontend**: React 18, TypeScript, Vite
- **Modelos de IA / Visão Computacional**:
  - **MediaPipe Tasks Vision**: Mapeamento de 478 landmarks faciais tridimensionais em tempo real (Head Pose / Yaw, Pitch, Roll e detecção de piscadas).
  - **Face-API (ResNet-34 / VGGFace2)**: Extração de tensores neurais de 128 dimensões (*face embeddings*) e cálculo de distância Euclidiana.
- **Backend & Banco de Dados**:
  - **Supabase**: PostgreSQL gerenciado na nuvem.
  - **Row Level Security (RLS)**: Proteção de acesso aos dados pessoais e biométricos.
  - **Tabelas**: `profiles`, `face_registrations` e `security_audit_logs`.

---

## 📋 Pré-requisitos

- **Node.js** (v18 ou superior)
- Navegador com suporte a WebGL e permissão de Câmera (Chrome, Edge ou Firefox)
- Projeto criado no [Supabase](https://supabase.com)

---

## 🛠️ Passo a Passo para Instalação e Execução

### 1. Clonar o repositório e instalar as dependências
```bash
git clone <URL_DO_SEU_REPOSITORIO>
cd AC-3-tri-rec-
npm install
```

### 2. Configurar as Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua_chave_aqui
```
*(As credenciais podem ser encontradas no painel do Supabase em: **Project Settings** -> **API**).*

### 3. Executar a Migration no Supabase
1. Acesse o **SQL Editor** no painel do Supabase.
2. Abra e copie todo o conteúdo do arquivo [`supabase_migration.sql`](./supabase_migration.sql).
3. Cole no SQL Editor e clique em **Run** para configurar as tabelas, chaves estrangeiras, políticas RLS e a função RPC.
4. *(Recomendado para apresentação escolar)*: Em **Authentication** -> **Providers** -> **Email**, desmarque a opção **"Confirm email"** para que novas contas fiquem ativas imediatamente.

### 4. Executar o Projeto
```bash
npm run dev
```
Abra o link exibido no terminal (geralmente `http://localhost:5173`) no navegador.

---

## 🎓 Roteiro para Apresentação Escolar

1. **Mostrar o Banco no Supabase**:
   - Abra o **Table Editor** e mostre que as tabelas `profiles`, `face_registrations` e `security_audit_logs` estão configuradas e vazias.
2. **Realizar o Cadastro Facial no App**:
   - Clique em **"Cadastrar Meu Rosto"**;
   - Preencha o nome, e-mail institucional e senha;
   - Realize as 4 etapas guiadas:
     1. Amostra Frontal;
     2. Perfil Esquerdo;
     3. Perfil Direito;
     4. Teste de Vivacidade Biométrica (*Liveness Detection* com piscada de olhos);
   - Os dados são processados e enviados à nuvem.
3. **Comprovar o Salvamento no Supabase**:
   - Dê um *refresh* no Table Editor do Supabase:
     - Em `profiles`: mostre o vetor neural de 128 dimensões e `role: 'user'`.
     - Em `face_registrations`: mostre o status `active` do usuário.
4. **Demonstrar o Reconhecimento Facial em Tempo Real**:
   - Volte para a tela inicial de autenticação;
   - Posicione o rosto na câmera: o sistema rastreará a malha facial, calculará a distância biométrica e liberará o acesso à **Área Restrita // Nível Alfa**.
5. **Demonstrar a Auditoria de Segurança**:
   - Na Área Restrita, acesse a aba **"Trilha de Auditoria"** e mostre o log gerado;
   - Mostre no Supabase que a tabela `security_audit_logs` recebeu o registro correspondente.
