with open('WorldCanvas.jsx', 'r', encoding='utf-8') as f:
    content = f.read().replace('\r\n', '\n')

# ─── PATCH 1: Add chat state after showDiagnostics state ───
old1 = "  const [showDiagnostics, setShowDiagnostics] = useState(false);\n  const [diagData, setDiagData] = useState(null);"
new1 = """  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagData, setDiagData] = useState(null);

  // Chat Sidebar State
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const chatMessagesRef = useRef([]);"""

# ─── PATCH 2: Add chat socket listener after 'user-left' handler ───
old2 = """    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
    });"""

new2 = """    // Room chat messages
    socket.on('room:chat:message', (payload) => {
      chatMessagesRef.current = [...chatMessagesRef.current, payload].slice(-200); // keep last 200
      setChatMessages([...chatMessagesRef.current]);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
    });"""

# ─── PATCH 3: Add scrollToBottom effect after refreshDiagnostics useEffect ───
old3 = """  useEffect(() => {
    if (!showDiagnostics) return;
    refreshDiagnostics();
    const timer = setInterval(refreshDiagnostics, 1000);
    return () => clearInterval(timer);
  }, [showDiagnostics, refreshDiagnostics]);"""

new3 = """  useEffect(() => {
    if (!showDiagnostics) return;
    refreshDiagnostics();
    const timer = setInterval(refreshDiagnostics, 1000);
    return () => clearInterval(timer);
  }, [showDiagnostics, refreshDiagnostics]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showChat]);

  const handleSendChatMessage = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg || !socketRef.current) return;
    socketRef.current.emit('room:chat:send', { roomId, message: msg });
    setChatInput('');
  }, [chatInput, roomId]);"""

# ─── PATCH 4: Add Chat toggle button in the floating HUD (before the divider before Leave) ───
# Find the "End Call / Leave Room Button" section and add a chat button before the divider
old4 = """          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: '#D9D7D0', margin: '0 2px' }} />

          {/* End Call / Leave Room Button */}"""

new4 = """          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: '#D9D7D0', margin: '0 2px' }} />

          {/* Chat Toggle Button */}
          <button
            onClick={() => setShowChat((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '10px',
              border: '1px solid ' + (showChat ? '#1c1b1b' : '#D9D7D0'),
              background: showChat ? '#1c1b1b' : '#F4F3EF',
              color: showChat ? '#ffffff' : '#1c1b1b',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative',
            }}
            title="Toggle room chat"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>chat</span>
            <span>Chat</span>
            {chatMessages.length > 0 && !showChat && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#FF4B2B',
                border: '1.5px solid #FAF9F5',
              }} />
            )}
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: '#D9D7D0', margin: '0 2px' }} />

          {/* End Call / Leave Room Button */}"""

# ─── PATCH 5: Add Chat Sidebar panel right after the canvas area closing tag (before the floating HUD) ───
# We'll inject it after the canvas element closing />
old5 = """        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          tabIndex={0}
          style={{
            display:'block',
            borderRadius:'16px',
            outline:'none',
            border:'1px solid #D9D7D0',
            boxShadow:'0 20px 45px -10px rgba(0,0,0,0.08), 0 8px 16px -6px rgba(0,0,0,0.04)',
            cursor:'default',
            maxWidth:'100%',
            background:'#ffffff',
          }}
        />"""

new5 = """        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          tabIndex={0}
          style={{
            display:'block',
            borderRadius:'16px',
            outline:'none',
            border:'1px solid #D9D7D0',
            boxShadow:'0 20px 45px -10px rgba(0,0,0,0.08), 0 8px 16px -6px rgba(0,0,0,0.04)',
            cursor:'default',
            maxWidth:'100%',
            background:'#ffffff',
          }}
        />

        {/* Chat Sidebar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: showChat ? 0 : '-340px',
            width: '320px',
            height: '100%',
            background: '#ffffff',
            border: '1px solid #D9D7D0',
            borderRadius: '0 16px 16px 0',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: showChat ? '-8px 0 24px rgba(0,0,0,0.08)' : 'none',
            transition: 'right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          {/* Chat Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid #E9E8E4',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#1c1b1b' }}>chat</span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#1c1b1b' }}>Room Chat</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '1px 7px',
                borderRadius: '20px',
                background: '#E9E8E4',
                color: '#5e5f5c',
              }}>{chatMessages.length}</span>
            </div>
            <button
              onClick={() => setShowChat(false)}
              style={{
                background: '#F4F3EF',
                border: '1px solid #D9D7D0',
                color: '#5e5f5c',
                cursor: 'pointer',
                borderRadius: '6px',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                transition: 'all 0.12s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {chatMessages.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                color: '#8C8880',
                userSelect: 'none',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '32px', opacity: 0.4 }}>forum</span>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>No messages yet</span>
                <span style={{ fontSize: '11px', textAlign: 'center', lineHeight: 1.4 }}>
                  Send a message to everyone in this room
                </span>
              </div>
            ) : (
              chatMessages.map((msg, i) => {
                const isSelf = msg.from === socketRef.current?.id;
                const ts = new Date(msg.timestamp);
                const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isSelf ? 'flex-end' : 'flex-start',
                    gap: '3px',
                  }}>
                    {!isSelf && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%',
                          backgroundColor: msg.avatarColor, flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#5e5f5c' }}>{msg.username}</span>
                      </div>
                    )}
                    <div style={{
                      maxWidth: '220px',
                      padding: '7px 11px',
                      borderRadius: isSelf ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: isSelf ? '#1c1b1b' : '#F4F3EF',
                      color: isSelf ? '#ffffff' : '#1c1b1b',
                      fontSize: '12px',
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                    }}>
                      {msg.message}
                    </div>
                    <span style={{ fontSize: '10px', color: '#BDBAB2' }}>{timeStr}</span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid #E9E8E4',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            flexShrink: 0,
          }}>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatMessage();
                }
              }}
              placeholder="Message the room..."
              rows={1}
              style={{
                flex: 1,
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #D9D7D0',
                fontSize: '12px',
                fontFamily: 'inherit',
                color: '#1c1b1b',
                background: '#FAF9F5',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.4,
                maxHeight: '80px',
                overflowY: 'auto',
                transition: 'border-color 0.12s ease',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#1c1b1b'; }}
              onBlur={(e) => { e.target.style.borderColor = '#D9D7D0'; }}
            />
            <button
              onClick={handleSendChatMessage}
              disabled={!chatInput.trim()}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: chatInput.trim() ? '#1c1b1b' : '#E9E8E4',
                color: chatInput.trim() ? '#ffffff' : '#BDBAB2',
                cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Send message (Enter)"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span>
            </button>
          </div>
        </div>"""

# Apply patches
patches = [
    (old1, new1, "chat state variables"),
    (old2, new2, "chat socket listener"),
    (old3, new3, "scrollToBottom + sendChatMessage"),
    (old4, new4, "chat toggle button in HUD"),
    (old5, new5, "chat sidebar panel"),
]

for old, new, label in patches:
    old_n = old.replace('\r\n', '\n')
    if old_n in content:
        content = content.replace(old_n, new)
        print(f"SUCCESS: {label}")
    else:
        print(f"ERROR: '{label}' target not found - searching for context...")
        # Show nearby lines for debugging
        key = old_n.split('\n')[1][:50] if '\n' in old_n else old_n[:50]
        for i, line in enumerate(content.split('\n')):
            if key.strip()[:30] in line:
                print(f"  Found similar @ line {i+1}: {line[:80]}")

with open('WorldCanvas.jsx', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(content)

print("\nDone.")
