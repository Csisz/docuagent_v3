content = open('/app/routers/dashboard.py', encoding='utf-8').read()
old = 'tenant_id = current_user.get("tenant_id") if current_user else None'
new = ('tenant_id = current_user.get("tenant_id") if current_user else None\n'
       '    import logging as _log; _log.getLogger("docuagent").warning('
       'f"DASHBOARD DEBUG tenant_id={tenant_id} auth_type={current_user.get(chr(97)+chr(117)+chr(116)+chr(104)+chr(95)+chr(116)+chr(121)+chr(112)+chr(101))}")')

if old in content:
    open('/app/routers/dashboard.py', 'w', encoding='utf-8').write(content.replace(old, new))
    print('OK - debug added')
else:
    print('NOT FOUND - searching for tenant_id line...')
    for i, line in enumerate(content.split('\n')):
        if 'tenant_id' in line and 'current_user' in line:
            print(f'  Line {i}: {line}')
