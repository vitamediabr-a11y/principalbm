\if :{?crm_app_password}
ALTER ROLE crm_app PASSWORD :'crm_app_password';
\else
\echo 'crm_app_password is required for disposable PostgreSQL verification'
\quit 1
\endif
