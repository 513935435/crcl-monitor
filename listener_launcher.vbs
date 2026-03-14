Set shell = CreateObject("WScript.Shell")
command = "powershell -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\T14s\Documents\New project\listener_supervisor.ps1"""
shell.Run command, 0, False
