# Liberar o acesso do administrador principal

## Diagnóstico confirmado
- A conta indumoveisinternacional@gmail.com existe e já tem o papel de administrador (o único do sistema).
- O login falha porque o e-mail da conta **ainda não foi confirmado**. O registro de acessos mostra o erro "Email not confirmed" nas tentativas de entrada.
- A tela de acesso mostra uma mensagem genérica ("Confira e-mail e senha"), o que dá a impressão de senha errada.

## O que será feito
1. **Confirmar somente esta conta:** marcar como confirmado o e-mail de indumoveisinternacional@gmail.com por uma operação administrativa. A regra de confirmação por e-mail continua valendo para novos cadastros (nenhuma confirmação automática geral será ligada). A senha não será alterada nem registrada.
2. **Mensagem clara na tela de acesso:** quando o e-mail não estiver confirmado, mostrar "Seu e-mail ainda não foi confirmado. Abra o link enviado para sua caixa de entrada." em vez da mensagem genérica. Senha incorreta continua com a mensagem atual.
3. **Testar de verdade:** entrar com a conta pelo preview, confirmar que o perfil é criado, que o painel abre e que o menu de Administração aparece. Confirmar que nenhuma outra conta recebeu privilégios.

## Detalhes técnicos
- Passo 1: `UPDATE auth.users SET email_confirmed_at = now() WHERE id = '78bab271-…' AND email_confirmed_at IS NULL` via operação de dados (não migração), restrito ao id verificado.
- Passo 2: em `src/routes/auth.tsx`, tratar `authError.code === "email_not_confirmed"` separadamente.
- Passo 3: sessão gerada com `lovable auth-session` para o usuário, Playwright em `/dashboard` e `/admin`; conferência de `user_roles` e `profiles`.
- Nada será publicado.
