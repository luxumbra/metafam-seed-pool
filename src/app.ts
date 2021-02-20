import { autoinject } from "aurelia-framework";
import { EventAggregator } from "aurelia-event-aggregator";
import { EventConfigException } from "services/GeneralEvents";
import { Router, RouterConfiguration } from "aurelia-router";
import { PLATFORM } from "aurelia-pal";
import "./styles/styles.scss";
import "./app.scss";
import { ConsoleLogService } from "services/ConsoleLogService";
import { Utils } from "services/utils";
import tippy from "tippy.js";

@autoinject
export class App {
  constructor (
    private eventAggregator: EventAggregator,
    private consoleLogService: ConsoleLogService) { }

  private router: Router;
  private onOff = false;
  private modalMessage: string;

  private errorHandler = (ex: unknown): boolean => {
    this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an unexpected error occurred", ex));
    return false;
  }

  public attached(): void {
    // so all elements with data-tippy-content will automatically have a tooltip
    tippy("[data-tippy-content]");

    window.addEventListener("error", this.errorHandler);

    this.eventAggregator.subscribe("dashboard.loading", async (onOff: boolean) => {
      this.modalMessage = "Thank you for your patience while we initialize for a few moments...";
      this.onOff = onOff;
    });

    this.eventAggregator.subscribe("transaction.sent", async () => {
      this.modalMessage = "Awaiting confirmation...";
      this.onOff = true;
    });

    this.eventAggregator.subscribe("transaction.confirmed", async () => {
      this.onOff = false;
    });

    this.eventAggregator.subscribe("transaction.failed", async () => {
      this.onOff = false;
    });

  }

  private configureRouter(config: RouterConfiguration, router: Router) {

    config.title = "primepool.eth";
    config.options.pushState = true;
    // const isIpfs = (window as any).IS_IPFS;
    // if (isIpfs) {
    //   this.consoleLogService.handleMessage(`Routing for IPFS: ${window.location.pathname}`);
    // }
    config.options.root = "/"; // window.location.pathname; // to account for IPFS
    /**
     * first set the landing page.
     * it is possible to be connected but have the wrong chain.
     */
    config.map([
      {
        moduleId: PLATFORM.moduleName("./home/home"),
        nav: true,
        name: "home",
        route: ["", "/", "home"],
        title: "Home",
      }
      , {
        moduleId: PLATFORM.moduleName("./pools/pools"),
        nav: true,
        name: "pools",
        route: ["pools"],
        title: "SEED Pool",
      }
      , {
        moduleId: PLATFORM.moduleName("./txHistory/tx-history"),
        nav: true,
        name: "txHistory",
        route: ["txHistory"],
        title: "Transaction History",
      }
    //   , {
    //     moduleId: PLATFORM.moduleName("./documentation/documentation"),
    //     nav: true,
    //     name: "documentation",
    //     route: ["documentation"],
    //     title: "Documentation",
    //   }
      , {
        moduleId: PLATFORM.moduleName("./seedToken/seed-token"),
        nav: true,
        name: "seedToken",
        route: ["seedToken"],
        title: "The SEED Token",
      }
      ,
      {
        moduleId: PLATFORM.moduleName("./pool/pool"),
        name: "pool",
        route: ["pool/:poolAddress"],
        title: "Pool",
      }
            , {
        moduleId: PLATFORM.moduleName("./liquidity/remove"),
        name: "liquidityRemove",
        route: ["liquidity/remove"],
        title: "Remove Liquidity",
      }
      , {
        moduleId: PLATFORM.moduleName("./staking/staking"),
        name: "staking",
        route: ["staking"],
        title: "Staking",
      },
    ]);

    config.fallbackRoute("home");

    this.router = router;
  }

  goto(where: string): void {
    Utils.goto(where);
  }

  contactUs() {
    window.open('mailto:hello@primedao.io', '#', 'noopener noreferrer');
  }
}
