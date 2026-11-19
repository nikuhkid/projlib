import json
import socket
import sys
import miniupnpc

gateway = None
for line in sys.stdin:
    try:
        command = json.loads(line)
        if gateway is None or command['action'] == 'discover':
            gateway = miniupnpc.UPnP()
            gateway.discoverdelay = 1000
            gateway.discover()
            gateway.selectigd()
        port = command.get('port', 8443)
        if command['action'] == 'discover':
            result = {'address': gateway.lanaddr, 'external': gateway.externalipaddress(),
                      'dns': socket.gethostbyname_ex(command['hostname'])[2]}
        elif command['action'] == 'read':
            result = gateway.getspecificportmapping(port, 'TCP')
        elif command['action'] == 'map':
            current = gateway.getspecificportmapping(port, 'TCP')
            expected = (gateway.lanaddr, port, command['description'])
            if current is not None and current[:3] != expected:
                raise RuntimeError('This router port belongs to another mapping')
            lease = command.get('lease', 900)
            if not gateway.addportmapping(port, 'TCP', gateway.lanaddr, port, command['description'], '', lease):
                raise RuntimeError('The router refused the finite UPnP lease')
            result = gateway.getspecificportmapping(port, 'TCP')
            if not result or result[:3] != expected or not 0 < int(result[4]) <= lease:
                raise RuntimeError('The router did not confirm a finite lease')
        elif command['action'] == 'remove':
            current = gateway.getspecificportmapping(port, 'TCP')
            if current and current[:3] == (gateway.lanaddr, port, command['description']):
                gateway.deleteportmapping(port, 'TCP')
            result = True
        else:
            raise ValueError('Unknown UPnP operation')
        print(json.dumps({'ok': True, 'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}), flush=True)
