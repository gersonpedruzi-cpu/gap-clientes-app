package br.com.gapengenharia.clientes;

// GAP Clientes · "Conectar inversor" (12/11/2026, Gerson): conversa por UDP com o datalogger Wi-Fi (Solarman/Sofar/Deye, LSW3)
// no Wi-Fi dele (AP_<serial>, 10.10.100.254:48899). O socket vai PRESO ao Wi-Fi: a rede do datalogger não tem internet,
// e sem isso o Android mandaria os pacotes pelos dados móveis.
// sessao({host, porta, passos: [{envia, espera, fim}]}) → {wifi, passos: [{respostas: ["..."]}]}
//   envia = texto (UTF-8); espera = ms no máximo; fim = texto que encerra o passo antes (ex.: "\r\n\r\n"); fim vazio = espera tudo.
//   passo com "hex" (ex.: "01 03 00 00") manda bytes; cada resposta volta também em "respostasHex" (protocolos binários).
// tcp({host, porta, passos}) → igual, por TCP.  http({url, metodo, corpo, cabecalhos, espera}) → {status, corpo}: página local do datalogger.
// conectarWifi({ssid, senha}) → o próprio app entra no Wi-Fi do datalogger (o Android pergunta ao usuário); desconectarWifi().
// abrirWifi() → abre as configurações de Wi-Fi do aparelho.
// (12/11, Gerson) tudo genérico de propósito: as outras marcas (Solplanet, Growatt, Auxsol por Bluetooth…) entram só pelo site, sem APK novo.
// A senha do Wi-Fi do cliente passa por aqui só para ir ao datalogger: não é gravada nem mostrada em log.

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.util.Iterator;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "GapWifi")
public class GapWifiPlugin extends Plugin {

    private Network redeFixa = null;
    private ConnectivityManager.NetworkCallback cbFixa = null;

    private ConnectivityManager cm() { return (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE); }

    private static byte[] deHex(String h) {
        String t = h.replaceAll("[^0-9A-Fa-f]", "");
        byte[] b = new byte[t.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(t.substring(i * 2, i * 2 + 2), 16);
        return b;
    }
    private static String paraHex(byte[] b, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) { if (i > 0) sb.append(' '); sb.append(String.format("%02x", b[i] & 0xff)); }
        return sb.toString();
    }
    private static byte[] bytesDo(JSONObject p) {
        String hx = p.optString("hex", "");
        if (!hx.isEmpty()) return deHex(hx);
        return p.optString("envia", "").getBytes(StandardCharsets.UTF_8);
    }

    private Network redeWifi() {
        if (redeFixa != null) return redeFixa;
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return null;
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            if (c != null && c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return n;
        }
        return null;
    }

    @PluginMethod
    public void sessao(final PluginCall call) {
        final String host = call.getString("host", "10.10.100.254");
        final int porta = call.getInt("porta", 48899);
        final JSArray passos = call.getArray("passos", new JSArray());
        new Thread(() -> {
            DatagramSocket s = null;
            try {
                s = new DatagramSocket();
                boolean preso = false;
                Network w = redeWifi();
                if (w != null) { try { w.bindSocket(s); preso = true; } catch (Exception ignorado) { } }
                InetAddress dest = InetAddress.getByName(host);
                JSArray saida = new JSArray();
                byte[] buf = new byte[4096];
                for (int i = 0; i < passos.length(); i++) {
                    JSONObject p = passos.getJSONObject(i);
                    int espera = Math.max(50, Math.min(20000, p.optInt("espera", 1500)));
                    String fim = p.optString("fim", "");
                    byte[] b = bytesDo(p);
                    if (b.length > 0) s.send(new DatagramPacket(b, b.length, dest, porta));
                    JSArray resp = new JSArray(), respHex = new JSArray();
                    long ate = System.currentTimeMillis() + espera;
                    while (true) {
                        long falta = ate - System.currentTimeMillis();
                        if (falta <= 0) break;
                        s.setSoTimeout((int) falta);
                        DatagramPacket r = new DatagramPacket(buf, buf.length);
                        try { s.receive(r); } catch (SocketTimeoutException t) { break; }
                        String txt = new String(r.getData(), 0, r.getLength(), StandardCharsets.UTF_8);
                        resp.put(txt);
                        respHex.put(paraHex(r.getData(), r.getLength()));
                        if (!fim.isEmpty() && txt.contains(fim)) break;
                    }
                    JSObject o = new JSObject();
                    o.put("respostas", resp);
                    o.put("respostasHex", respHex);
                    saida.put(o);
                }
                JSObject ret = new JSObject();
                ret.put("wifi", preso);
                ret.put("passos", saida);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha na conversa com o datalogger: " + e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : ""));
            } finally {
                if (s != null) s.close();
            }
        }).start();
    }

    @PluginMethod
    public void tcp(final PluginCall call) {
        final String host = call.getString("host", "10.10.100.254");
        final int porta = call.getInt("porta", 8899);
        final JSArray passos = call.getArray("passos", new JSArray());
        new Thread(() -> {
            Socket s = null;
            try {
                Network w = redeWifi();
                s = w != null ? w.getSocketFactory().createSocket() : new Socket();
                s.connect(new InetSocketAddress(host, porta), call.getInt("conecta", 5000));
                OutputStream out = s.getOutputStream(); InputStream in = s.getInputStream();
                JSArray saida = new JSArray(); byte[] buf = new byte[4096];
                for (int i = 0; i < passos.length(); i++) {
                    JSONObject p = passos.getJSONObject(i);
                    int espera = Math.max(50, Math.min(20000, p.optInt("espera", 1500)));
                    String fim = p.optString("fim", "");
                    byte[] b = bytesDo(p);
                    if (b.length > 0) { out.write(b); out.flush(); }
                    ByteArrayOutputStream acc = new ByteArrayOutputStream();
                    long ate = System.currentTimeMillis() + espera;
                    while (true) {
                        long falta = ate - System.currentTimeMillis();
                        if (falta <= 0) break;
                        s.setSoTimeout((int) falta);
                        int n;
                        try { n = in.read(buf); } catch (SocketTimeoutException t) { break; }
                        if (n < 0) break;
                        acc.write(buf, 0, n);
                        if (!fim.isEmpty() && new String(acc.toByteArray(), StandardCharsets.UTF_8).contains(fim)) break;
                    }
                    byte[] a = acc.toByteArray();
                    JSObject o = new JSObject();
                    o.put("resposta", new String(a, StandardCharsets.UTF_8));
                    o.put("respostaHex", paraHex(a, a.length));
                    saida.put(o);
                }
                JSObject ret = new JSObject(); ret.put("wifi", w != null); ret.put("passos", saida); call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha no TCP: " + e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : ""));
            } finally {
                try { if (s != null) s.close(); } catch (Exception ignorado) { }
            }
        }).start();
    }

    @PluginMethod
    public void http(final PluginCall call) {
        final String url = call.getString("url", "");
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                Network w = redeWifi();
                URL u = new URL(url);
                c = (HttpURLConnection) (w != null ? w.openConnection(u) : u.openConnection());
                int espera = call.getInt("espera", 8000);
                c.setConnectTimeout(espera); c.setReadTimeout(espera);
                c.setRequestMethod(call.getString("metodo", "GET"));
                JSObject cab = call.getObject("cabecalhos", new JSObject());
                for (Iterator<String> it = cab.keys(); it.hasNext(); ) { String k = it.next(); c.setRequestProperty(k, cab.getString(k)); }
                String corpo = call.getString("corpo", null);
                if (corpo != null) { c.setDoOutput(true); OutputStream o = c.getOutputStream(); o.write(corpo.getBytes(StandardCharsets.UTF_8)); o.close(); }
                int st = c.getResponseCode();
                InputStream in = st >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream acc = new ByteArrayOutputStream();
                if (in != null) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0 && acc.size() < 2_000_000) acc.write(buf, 0, n); in.close(); }
                JSObject ret = new JSObject(); ret.put("status", st); ret.put("corpo", new String(acc.toByteArray(), StandardCharsets.UTF_8)); ret.put("wifi", w != null);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha no HTTP: " + e.getClass().getSimpleName() + (e.getMessage() != null ? " " + e.getMessage() : ""));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    // o app mesmo entra no Wi-Fi do datalogger (Android 10+: aparece uma janela do sistema para confirmar)
    @PluginMethod
    public void conectarWifi(final PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) { call.reject("Android antigo: entre no Wi-Fi do datalogger pelas configurações", "ANTIGO"); return; }
        String ssid = call.getString("ssid", "");
        String senha = call.getString("senha", "");
        if (ssid.isEmpty()) { call.reject("Faltou o nome da rede"); return; }
        soltar();
        WifiNetworkSpecifier.Builder sb = new WifiNetworkSpecifier.Builder().setSsid(ssid);
        if (!senha.isEmpty()) sb.setWpa2Passphrase(senha);
        NetworkRequest req = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).setNetworkSpecifier(sb.build()).build();
        final boolean[] feito = {false};
        cbFixa = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { redeFixa = n; if (!feito[0]) { feito[0] = true; JSObject r = new JSObject(); r.put("ok", true); call.resolve(r); } }
            @Override public void onUnavailable() { redeFixa = null; if (!feito[0]) { feito[0] = true; call.reject("Não entrou no Wi-Fi " , "INDISPONIVEL"); } }
            @Override public void onLost(Network n) { if (n.equals(redeFixa)) redeFixa = null; }
        };
        try { cm().requestNetwork(req, cbFixa, call.getInt("espera", 30000)); }
        catch (Exception e) { cbFixa = null; call.reject("Falha ao pedir o Wi-Fi: " + e.getMessage()); }
    }

    private void soltar() {
        if (cbFixa != null) { try { cm().unregisterNetworkCallback(cbFixa); } catch (Exception ignorado) { } }
        cbFixa = null; redeFixa = null;
    }

    @PluginMethod
    public void desconectarWifi(PluginCall call) { soltar(); call.resolve(); }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject(); r.put("versao", 1); r.put("android", Build.VERSION.SDK_INT); r.put("wifi", redeWifi() != null); r.put("fixa", redeFixa != null);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirWifi(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_WIFI_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não abriu as configurações de Wi-Fi");
        }
    }
}
