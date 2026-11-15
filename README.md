# Finanze per Home Assistant

Gestione delle finanze personali **solo con inserimento manuale**: niente collegamento alla banca, niente scontrini.
Aggiunge una voce **Finanze** nella barra laterale di Home Assistant, pensata per l'uso dal telefono (app Companion).

- **Home**: saldo totale e per conto, entrate/uscite del mese, dove vanno i soldi, spese fisse da registrare, ultimi movimenti
- **Aggiungi (+)**: importo, categoria con un tocco (le più usate per prime), suggerimenti dalle descrizioni passate che compilano categoria, conto e metodo
- **Movimenti**: per mese, ricerca, filtri per tipo, categoria e conto; tocca un movimento per modificarlo o eliminarlo
- **Report**: mese o anno, andamento mensile, uscite per categoria, metodo di pagamento e conto, mutuo + finanziamenti + abbonamenti
- **Spese fisse**: mensili, bimestrali, trimestrali, semestrali o annuali, con data dell'ultima rata. Alla scadenza arriva una notifica sul telefono con i pulsanti **Registra** e **Salta**; quando uno dei due telefoni risponde, la notifica sparisce anche dall'altro
- **Trasferimenti** tra conti (prelievi, conto deposito): spostano il saldo ma non contano come entrate o uscite
- **Impostazioni**: conti con saldo iniziale, categorie, metodi di pagamento (rinominando una voce si aggiornano anche i movimenti), import/export JSON, export CSV

## Un archivio per ogni utente
Ogni utente di Home Assistant che apre **Finanze** ha un archivio tutto suo: conti, movimenti, categorie, spese fisse e promemoria non sono condivisi.
Il pannello mostra «Archivio di <nome>» sotto il titolo.

- I dati sono salvati in `.storage/finanze.utente_<id utente>` e finiscono nei normali backup.
- Ogni utente sceglie in **Impostazioni → Promemoria** su quali dispositivi ricevere le notifiche delle *sue* spese fisse.
- Le risposte Registra/Salta sono accettate solo dall'utente proprietario della spesa.
- Limite da conoscere: un amministratore che apre i file di `.storage` (o un backup) può leggere tutti gli archivi. Home Assistant non offre una cifratura per utente.

Stile grafico ispirato alla dashboard «Home»: sfondo scuro, pannelli arrotondati e accento arancione.

## Installazione con HACS

1. HACS → menu ⋮ → **Repository personalizzati** → `https://github.com/Thonno/ha-financetracker`, tipo **Integrazione** → Aggiungi
2. Cerca **Finanze** in HACS → Scarica
3. Riavvia Home Assistant
4. Impostazioni → Dispositivi e servizi → **Aggiungi integrazione** → **Finanze**: scegli l'orario dei promemoria
5. Ogni utente apre **Finanze** dalla barra laterale e, in Impostazioni, sceglie i propri dispositivi per le notifiche

### Installazione manuale
Copia la cartella `custom_components/finanze` dentro `/config/custom_components/` (ad es. con l'add-on Samba o File editor) e riavvia.

## Importare i dati dal vecchio Excel
Accedi con il **tuo** utente → pannello Finanze → **Impostazioni** → **Importa e sostituisci tutto…** → scegli `finanze_import.json`. I dati finiscono solo nel tuo archivio.

Per rigenerare il file da una versione più recente dell'Excel (serve Python con `openpyxl`):

```
python3 tools/excel_to_finanze.py Gestione_Finanze_Personali.xlsx finanze_import.json \
    --principale "Conto corrente" --deposito "Conto deposito"
```

Il convertitore trasforma i movimenti con categoria «Prelievo» in trasferimenti verso *Contanti*. Con `--principale` e `--deposito` trasforma anche i movimenti «Conto deposito» del conto principale in trasferimenti verso/dal conto deposito. Per le spese fisse ricava giorno e prossima scadenza dall'ultimo pagamento trovato; quelle senza pagamenti trovati sono segnate **da verificare**.

## Sensori (facoltativi, per utente)
Ogni utente può attivarli in **Impostazioni → Sensori in Home Assistant**. Attenzione: le entità di Home Assistant sono visibili a **tutti** gli utenti, quindi sono spenti di default.

| Entità | Contenuto |
|---|---|
| `sensor.finanze_<utente>_saldo_totale` | saldo complessivo (attributo `conti`) |
| `sensor.finanze_<utente>_saldo_<conto>` | saldo di ogni conto |
| `sensor.finanze_<utente>_entrate_mese` / `uscite_mese` / `netto_mese` | mese corrente |
| `sensor.finanze_<utente>_spese_fisse_mensili` | totale mensile delle spese fisse attive |
| `sensor.finanze_<utente>_scadenze` | spese fisse da registrare |

## Azioni (per automazioni, script, Assist)
Scrivono nell'archivio di chi esegue l'azione. Da un'automazione (nessun utente) indica `utente:` con il nome dell'utente di Home Assistant; solo un amministratore può scrivere nell'archivio di un altro.
```yaml
action: finanze.aggiungi_movimento
data:
  importo: 12.50
  categoria: Spesa
  descrizione: Coop
  conto: Conto corrente
  metodo: Bancomat
  utente: Mario
```
```yaml
action: finanze.registra_spesa_fissa
data:
  spesa: Mutuo
```
