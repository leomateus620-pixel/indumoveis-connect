# Acesso principal — Indumóveis Connect

## Resultado esperado
Criar uma conta de acesso por e-mail para o endereço indicado e atribuir a ela, de forma explícita e exclusiva, o papel inicial de administrador. A senha informada será usada somente para a criação da conta, nunca salva em arquivos, planos ou mensagens de resultado.

## Etapas
1. Verificar se o cadastro por e-mail está habilitado e criar a conta pelo fluxo de autenticação existente, sem inserir credenciais diretamente nas tabelas de autenticação. Se houver confirmação por e-mail, aguardar a confirmação antes de afirmar que o acesso funciona.
2. Após a conta existir, conferir sua identidade e o estado dos administradores. Provisionar o papel `admin` apenas para a conta correspondente ao endereço indicado, por operação privilegiada e com proteção contra duplicidade; preservar os demais usuários e permissões.
3. Testar o login e a abertura da área administrativa com essa conta; confirmar que não houve promoção automática de outras contas. Comunicar qualquer etapa que dependa de confirmação de e-mail ou de aprovação administrativa.

## Limites técnicos e segurança
- O banco foi consultado: neste momento não há conta com esse e-mail nem papel de administrador. Já existe proteção contra remover o último administrador e uma função de provisionamento inicial restrita a operações privilegiadas.
- Não alterar configurações externas silenciosamente, não criar recuperação de senha, não registrar a senha em código ou logs, não publicar.
- Se a criação segura ou a operação privilegiada não estiver disponível, parar nessa etapa e informar o bloqueio, sem contornar as proteções.
