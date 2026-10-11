"""Small optional provider process. No credentials; Python dependency is edge-tts==7.2.8."""
import asyncio, json, sys
import edge_tts
async def main():
    request = json.load(sys.stdin)
    words = []
    communicate = edge_tts.Communicate(request['text'], request['voice'], rate=request['rate'], boundary='WordBoundary', connect_timeout=15, receive_timeout=30)
    with open(request['output'], 'wb') as audio:
        async for chunk in communicate.stream():
            if chunk['type'] == 'audio': audio.write(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                words.append({'offsetMs':chunk['offset']/10000,'durationMs':chunk['duration']/10000,'text':chunk['text']})
    json.dump(words, sys.stdout)
asyncio.run(main())
