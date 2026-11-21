const topics=[
  ['Movement and proximity','Use WASD or the arrow keys to walk, or drag on the meeting canvas on a touch screen. Move closer to a teammate to hear their voice more clearly.'],
  ['Microphone and playback','Allow microphone access when prompted. Use the microphone control to mute or unmute, and Audio settings inside a meeting to select an input device or inspect the connection.'],
  ['Rooms and invitations','Open the directory to enter a room, or choose Join by code and paste your invitation. Use Host a meeting to create a named room with an office, auditorium or lounge layout.'],
  ['Organization workspaces','Open Organizations to see your team, scheduled meetings and offices. Organization administrators can schedule meetings and manage team members.'],
  ['Layout drafts','Open Layout drafts to resume an unfinished design. Drafts are saved in the current browser for your account and selected workspace.']
];
export default function Help(){return <section><h1>Workspace guide</h1><div className="hub-card hub-guide">{topics.map(([title,body],i)=><details key={title} open={i===0 || undefined}><summary>{title}</summary><p>{body}</p></details>)}</div></section>;}
