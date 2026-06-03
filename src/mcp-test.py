import subprocess
import json

process = subprocess.Popen(
    ["C:\\Program Files\\nodejs\\node.exe", "build/index.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True
)

def send(request):
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    line = process.stdout.readline()
    return json.loads(line)

initialize = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "vanguard-smoke-test", "version": "0.1.0"}
    }
}

print("INITIALIZE RESPONSE:\n", json.dumps(send(initialize), indent=2))

process.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
process.stdin.flush()

tools = {"jsonrpc": "2.0", "method": "tools/list", "id": 2}
print("TOOLS RESPONSE:\n", json.dumps(send(tools), indent=2))

call_tool = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 3,
    "params": {
        "name": "latest_tech_trends",
        "arguments": {"query": "agent", "limit": 3, "sinceDays": 14}
    }
}
print("SAMPLE TOOL CALL:\n", json.dumps(send(call_tool), indent=2))

process.terminate()
