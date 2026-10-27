# Bridge and Virtual Interface Detection

If the USRP-facing NIC is enslaved to a bridge (Linux `br0`, Windows Hyper-V vSwitch, NIC teaming), the static IP and MTU must be set on the **bridge interface**, not the physical NIC. Discovery (`findsdru`) will fail if the IP is on the wrong interface.

## Linux

```matlab
% Check if the USRP-facing interface is enslaved to a bridge
[~, master] = system('ip -o link show <iface> | grep -o "master [^ ]*"');
if ~isempty(strtrim(master))
    fprintf("WARNING: %s is enslaved to a bridge (%s)\n", '<iface>', strtrim(master));
    fprintf("The static IP and MTU must be set on the bridge interface, not the physical NIC.\n");
end

% List all bridge interfaces and their members
[~, bridges] = system('bridge link show 2>/dev/null');
disp(bridges)
```

## Windows

```matlab
% Check for Hyper-V virtual switches or NIC teaming (these enslave the physical NIC)
[~, vmSwitch] = system('powershell "if (Get-Command Get-VMSwitch -ErrorAction SilentlyContinue) { Get-VMSwitch | Format-Table Name, NetAdapterInterfaceDescription }"');
disp(vmSwitch)

% Check for bridged adapters
[~, bridged] = system('powershell "Get-NetAdapter | Where-Object { $_.InterfaceDescription -like ''*Bridge*'' } | Format-Table Name, InterfaceDescription, Status"');
disp(bridged)
```

## When to Check

- `findsdru` returns empty despite correct subnet and cabling
- Host has Hyper-V, Docker, or libvirt installed (these create bridges)
- `ip link show` reports a `master` on the NIC
- Multiple NICs or NIC teaming is configured

Copyright 2026 The MathWorks, Inc.
