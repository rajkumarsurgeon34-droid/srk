package in.shazverse.srkvpn;

import com.wireguard.config.BadConfigException;
import com.wireguard.config.Config;
import com.wireguard.config.InetNetwork;
import com.wireguard.config.Interface;
import com.wireguard.config.Peer;
import com.wireguard.crypto.KeyPair;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Pure-Java helpers around WireGuard configs: parsing with friendly errors, split tunnelling, summaries, new keys. */
public final class Tunnels {
    private Tunnels() { }

    /** Parses a wg-quick config. Throws IllegalArgumentException with a message a person can act on. */
    public static Config parse(String text) {
        if (text == null || text.trim().isEmpty()) throw new IllegalArgumentException("The config is empty");
        String t = text.replace("\r\n", "\n").replace('\r', '\n').trim();
        if (!t.contains("[Interface]")) throw new IllegalArgumentException("This isn’t a WireGuard config — it needs an [Interface] section");
        if (!t.contains("[Peer]")) throw new IllegalArgumentException("The config has no [Peer] section (the server to connect to)");
        try { return Config.parse(new BufferedReader(new StringReader(t))); }
        catch (BadConfigException e) { throw new IllegalArgumentException(explain(e)); }
        catch (IOException e) { throw new IllegalArgumentException("Couldn’t read the config"); }
        catch (RuntimeException e) { throw new IllegalArgumentException("The config has a mistake: " + e.getMessage()); }
    }
    static String explain(BadConfigException e) {
        String where = e.getSection() == null ? "" : (e.getSection().getName() + (e.getLocation() == null ? "" : " → " + e.getLocation().getName()));
        String what;
        switch (e.getReason()) {
            case INVALID_KEY: what = "the key isn’t valid (it should be 44 characters ending in “=”)"; break;
            case INVALID_NUMBER: what = "that should be a number"; break;
            case INVALID_VALUE: what = "that value isn’t valid"; break;
            case MISSING_ATTRIBUTE: what = "a required line is missing"; break;
            case MISSING_SECTION: what = "a section is missing"; break;
            case SYNTAX_ERROR: what = "a line isn’t written correctly"; break;
            case UNKNOWN_ATTRIBUTE: what = "there’s a line SRK VPN doesn’t understand"; break;
            case UNKNOWN_SECTION: what = "there’s an unknown section"; break;
            default: what = "something is wrong";
        }
        String text = e.getText() == null ? "" : " (“" + e.getText() + "”)";
        return "Problem in the config" + (where.isEmpty() ? "" : " — " + where) + ": " + what + text;
    }

    /** Returns the config with split tunnelling applied. mode: "all" (keep what the file says), "exclude" (these apps skip the VPN), "only" (only these apps use it). */
    public static Config withApps(Config c, String mode, Collection<String> apps) throws BadConfigException {
        if (mode == null || "all".equals(mode) || apps == null || apps.isEmpty()) return c;
        Interface in = c.getInterface();
        Interface.Builder b = new Interface.Builder().setKeyPair(in.getKeyPair()).addAddresses(in.getAddresses()).addDnsServers(in.getDnsServers()).addDnsSearchDomains(in.getDnsSearchDomains());
        if (in.getListenPort().isPresent()) b.setListenPort(in.getListenPort().get());
        if (in.getMtu().isPresent()) b.setMtu(in.getMtu().get());
        if ("only".equals(mode)) b.includeApplications(apps); else b.excludeApplications(apps);
        return new Config.Builder().setInterface(b.build()).addPeers(c.getPeers()).build();
    }

    /** What the list and details screens show about a config. */
    public static Map<String, Object> summary(Config c) {
        Map<String, Object> m = new LinkedHashMap<>(); Interface in = c.getInterface();
        List<Object> addr = new ArrayList<>(); for (InetNetwork n : in.getAddresses()) addr.add(n.toString());
        List<Object> dns = new ArrayList<>(); for (InetAddress a : in.getDnsServers()) dns.add(a.getHostAddress());
        List<Object> endpoints = new ArrayList<>(); Set<String> allowed = new LinkedHashSet<>(); boolean full4 = false, full6 = false;
        for (Peer p : c.getPeers()) {
            if (p.getEndpoint().isPresent()) endpoints.add(p.getEndpoint().get().toString());
            for (InetNetwork n : p.getAllowedIps()) { boolean v6 = n.getAddress() instanceof java.net.Inet6Address; String s = n.getMask() == 0 ? (v6 ? "::/0" : "0.0.0.0/0") : n.toString(); allowed.add(s); if (n.getMask() == 0) { if (v6) full6 = true; else full4 = true; } }
        }
        m.put("addresses", addr); m.put("dns", dns); m.put("endpoints", endpoints); m.put("allowed", new ArrayList<Object>(allowed));
        m.put("fullTunnel", full4); m.put("ipv6", full6); m.put("peers", c.getPeers().size()); m.put("publicKey", in.getKeyPair().getPublicKey().toBase64());
        m.put("included", new ArrayList<Object>(in.getIncludedApplications())); m.put("excluded", new ArrayList<Object>(in.getExcludedApplications()));
        if (in.getMtu().isPresent()) m.put("mtu", in.getMtu().get());
        return m;
    }

    /** A starting config with a fresh key pair, for setting up a new server or device. */
    public static String template(KeyPair kp) {
        return "[Interface]\n# Your public key (give this to the server): " + kp.getPublicKey().toBase64() + "\nPrivateKey = " + kp.getPrivateKey().toBase64() + "\nAddress = 10.0.0.2/32\nDNS = 1.1.1.1, 1.0.0.1\n\n[Peer]\n# The server's public key and address\nPublicKey = \nEndpoint = server.example.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25\n";
    }

    /** Linux interface names: 15 characters, letters/digits/_=+.- only */
    public static String ifaceName(String id) { String s = ("srk" + id).replaceAll("[^a-zA-Z0-9_=+.-]", ""); return s.length() > 15 ? s.substring(0, 15) : s; }

    /** A tunnel name from a file name: "Mumbai-1.conf" → "Mumbai-1" */
    public static String nameFromFile(String file) {
        String n = file == null ? "" : file.replaceAll("(?i)\\.conf$", "").replaceAll("[_]+", " ").trim();
        if (n.length() > 40) n = n.substring(0, 40);
        return n.isEmpty() ? "My VPN" : n;
    }
}
