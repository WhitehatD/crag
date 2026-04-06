# crag demo recording
# Record with: vhs demo.tape
# Requires: brew install charmbracelet/tap/vhs ffmpeg

Output "./demo.gif"

Set Shell "bash"
Set FontSize 15
Set Width 1280
Set Height 580
Set Theme "Catppuccin Mocha"
Set Padding 6
Set TypingSpeed 40ms
Set PlaybackSpeed 0.8
Set Framerate 24

# Invisibly set up the PATH shim so npx resolves instantly
Hide
Type "export PATH=/tmp/demo-bin:$PATH"
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 300ms
Show

# The visible recording starts here
Type "npx @whitehatd/crag demo"
Sleep 400ms
Enter
Sleep 4s
