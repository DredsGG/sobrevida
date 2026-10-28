"""Teste real no Firefox (CI): instala a Sobrevida como temporária e roda o fluxo principal no PokéSurvivor REAL
(build do repositório público do jogo, servido por server.mjs): tutorial da instalação nova, menu "Escolha seu parceiro"
na aba Criar conta, teste respondido sozinho (Psyduck), o piloto pegando o jogo (mundo MAIN no document_start),
farm ligado começando partida sozinho, partida marcada como do farm e o selo do ranking bloqueado antes da rede.
Uso: python run_firefox.py <pasta-da-extensao> <pasta-de-saida> [segundos-de-farm]"""
import json, os, sys, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.actions.action_builder import ActionBuilder

EXT, OUT = sys.argv[1], sys.argv[2]
FARM_S = int(sys.argv[3]) if len(sys.argv) > 3 else 120
os.makedirs(OUT, exist_ok=True)
o = Options()
o.add_argument('-headless')
o.accept_insecure_certs = True
o.set_preference('intl.accept_languages', 'pt-BR')
o.set_preference('media.autoplay.default', 0)
d = webdriver.Firefox(options=o)
d.set_window_size(1366, 768)
res = {'firefox': d.capabilities.get('browserVersion')}
ok = True


def check(name, cond, info=None):
    global ok
    res[name] = {'ok': bool(cond), 'info': info}
    ok = ok and bool(cond)
    print(('OK  ' if cond else 'FAIL') + ' ' + name + ('  ' + json.dumps(info, ensure_ascii=False) if info is not None else ''), flush=True)


def js(s, *a):
    return d.execute_script(s, *a)


def wait_for(fn, t=15):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(0.25)
    return None


def shot(name):
    try:
        d.save_screenshot(os.path.join(OUT, name))
    except Exception:
        pass


def click(x, y):
    a = ActionBuilder(d); a.pointer_action.move_to_location(int(x), int(y)).click(); a.perform()


def click_shadow(sel):
    r = js("const h = document.querySelector('#sobrevida-host'); const e = h && h.shadowRoot.querySelector(arguments[0]);"
           "if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];", sel)
    if r:
        click(*r)
    return bool(r)


def shadow_count(sel):
    return js("const h = document.querySelector('#sobrevida-host'); return h ? h.shadowRoot.querySelectorAll(arguments[0]).length : -1;", sel)


def visible_screens():
    return js("return [...document.querySelectorAll('.scr')].filter(e => !e.classList.contains('hidden')).map(e => e.id);")


# status do piloto (mundo MAIN): o mesmo evento que o painel da Sobrevida escuta
LISTEN = "if (!window.__svListen) { window.__svListen = 1; window.__st = null; document.addEventListener('sobrevida:st', e => { window.__st = JSON.parse(e.detail); }); }"
ST = "return window.__st;"

try:
    d.install_addon(EXT, temporary=True)
    time.sleep(3)
    main = d.current_window_handle
    for h in d.window_handles:  # o guia de instalação abre numa aba própria
        if h != main:
            d.switch_to.window(h); res['guideTab'] = d.current_url[:60]; d.close()
    d.switch_to.window(main)
    check('guia abre na instalação', 'guideTab' in res, res.get('guideTab'))

    d.get('https://pokesurvivor.com/')
    js(LISTEN)
    check('Sobrevida entra na página', wait_for(lambda: shadow_count('.fab') == 1, 15))
    tut = wait_for(lambda: shadow_count('.card.on') == 1, 10)
    check('tutorial na instalação nova', tut)
    time.sleep(0.6); shot('ff-01-tutorial.png')
    ActionChains(d).send_keys(Keys.ESCAPE).perform(); time.sleep(0.6)
    check('tutorial fecha no Esc', shadow_count('.card.on') == 0)

    st = wait_for(lambda: (lambda s: s if s and s.get('ok') else None)(js(ST)), 25)
    check('piloto pegou o jogo no Firefox (namespace)', st, st and {'scr': st.get('scr'), 'guest': st.get('guest')})

    # abertura "toque para começar": clica até aparecer o login
    for _ in range(12):
        v = visible_screens()
        if any(x in v for x in ('scr-login', 'scr-menu', 'scr-test')):
            break
        click(683, 450); time.sleep(1.5)
    js("const t = document.querySelector('#scr-login .tab[data-tab=\"register\"]'); t && t.click();")
    pick = wait_for(lambda: shadow_count('.pick.on') == 1, 8)
    check('menu "Escolha seu parceiro" abre na aba Criar conta', pick)
    time.sleep(0.8); shot('ff-02-parceiro.png')
    sel = js("const h = document.querySelector('#sobrevida-host').shadowRoot.querySelector('.pick .info h3'); return h && h.textContent;")
    check('Psyduck vem marcado como melhor', sel and 'Psyduck' in sel, sel)
    click_shadow('.pick .go'); time.sleep(0.6)
    js("document.querySelector('#btn-guest').click();")
    menu = wait_for(lambda: 'scr-menu' in visible_screens(), 40)
    shot('ff-03-menu-jogo.png')
    st = js(ST) or {}
    check('teste respondido sozinho → Psyduck', menu and (st.get('partner') or {}).get('dex') == 54, {'screens': visible_screens(), 'partner': st.get('partner')})

    # farm: abre o menu do coração e liga
    for _ in range(3):
        if shadow_count('.menu.on') == 1:
            break
        click_shadow('.fab'); time.sleep(0.8)
    check('menu do coração abre com a seção do farm', shadow_count('.menu.on') == 1 and shadow_count('.menu .farm .fgo') == 1)
    shot('ff-04-farm-menu.png')
    click_shadow('.menu .farm .fgo'); time.sleep(1.5)
    js("return fetch('https://ice.pokesurvivor.com/v1/seal', { method: 'POST' }).catch(() => null);"); time.sleep(1)
    seals = js("return fetch('/__test/seals').then(r => r.json());")
    check('selo do ranking bloqueado antes da rede (declarativeNetRequest no Firefox)', seals and seals['seals'] == 0, seals)

    t0 = time.time(); run_seen = False; best = None; shot_run = False
    while time.time() - t0 < FARM_S:
        time.sleep(3)
        s = js(ST) or {}
        if s.get('run'):
            run_seen = True
            if not best or s['run'].get('t', 0) > best.get('t', 0):
                best = s['run']
            if s['run'].get('t', 0) > 20 and not shot_run:
                shot_run = True; shot('ff-05-farm-partida.png')
        print('  %3ds %s task=%s mode=%s run=%s fps=%s' % (time.time() - t0, s.get('st'), s.get('task'), s.get('mode'), s.get('run') and s['run'].get('t'), s.get('fps')), flush=True)
    s = js(ST) or {}
    check('farm começou partida sozinho no Firefox', run_seen, best)
    check('partida marcada como do farm (fora do ranking)', s.get('touched') is True)
    check('farm anda e luta (passou de 20 s na partida)', best and best.get('t', 0) > 20, best)
    seals = js("return fetch('/__test/seals').then(r => r.json());")
    check('nenhum selo saiu durante o farm', seals and seals['seals'] == 0, seals)
except Exception as e:
    check('sem erro inesperado', False, repr(e)[:300])
    shot('ff-erro.png')
finally:
    json.dump(res, open(os.path.join(OUT, 'resultado.json'), 'w'), ensure_ascii=False, indent=1)
    d.quit()
print('TUDO PASSOU' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
