
import json, time

def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body') or '{}')
        pid = body.get('patientId'); name = body.get('name')
        if not pid or not name:
            return _res(400, {"error": "patientId and name required"})
        item = {"patientId": pid, "name": name, "createdAt": int(time.time())}
        return _res(200, {"status": "registered", "patient": item})
    except Exception as e:
        return _res(500, {"error": str(e)})

def _res(code, payload):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS"
        },
        "body": json.dumps(payload),
        "isBase64Encoded": False
    }
