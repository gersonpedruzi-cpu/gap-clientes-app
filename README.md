# App GAP Clientes (Android; depois iPhone)

App **híbrido** (Capacitor 8): o GAP Clientes vai **dentro** do app (pasta `web/`, cópia de `site/cliente` do GAP Controle).
Não é site empacotado: abre sem barra do Chrome, sem zoom, com ícone e tela de abertura, e os avisos vêm pelo **Firebase**.

- Pacote: `br.com.gapengenharia.clientes` (não muda nunca mais depois de publicado).
- Avisos: o app grava o aparelho em `push_inscricoes` como `fcm:<token>` (app `cliente`); as funções `usinas-coleta` e
  `aviso-offgrid` mandam pelo FCM com a conta de serviço do Secret `FCM_CONTA` do Supabase.
- `android/app/google-services.json`: arquivo do Firebase (não é senha).

## Atualizar o app depois de mudar o GAP Clientes
1. No GAP Controle: `python3 build_cliente.py` (em `fonte/build`).
2. Copiar `site/cliente/*` para `web/` deste repositório e enviar para o `main`.
3. O GitHub monta sozinho (aba **Actions › Montar app Android**). Baixe o `gap-clientes-N`:
   - `.aab` → Play Console (teste fechado / produção);
   - `.apk` (debug) → instalar direto no celular para testar.

## Chave de envio (uma vez)
1. Secrets do repositório (Settings › Secrets and variables › Actions): `CHAVE_SENHA` = uma senha sua.
2. Actions › **Criar chave de envio (uma vez)** › Run workflow. Baixe `gap-clientes-chave`.
3. Copie o texto de `chave-base64.txt` para o Secret `CHAVE_BASE64`. Guarde o `.jks` num lugar seguro e apague o artifact.
