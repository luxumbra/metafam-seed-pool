import {
  autoinject,
  bindable,
  bindingMode,
  computedFrom,
  containerless
} from "aurelia-framework";
import { NumberService } from "services/NumberService";
import { Utils } from "services/utils";
import tippy from "tippy.js";

@autoinject
@containerless()
export class FormattedNumber {

  /**
   * how many significant digits we want to display
   */
  //  @bindable({ defaultBindingMode: bindingMode.toView }) public format?: string;
  @bindable public precision?: string | number;
  @bindable public average?: string | boolean;
  @bindable public mantissa?: string | number;
  @bindable public value: number | string;
  @bindable public placement = "top";
  @bindable public defaultText = "--";
  @bindable public thousandsSeparated?: string | boolean;


  private text: string;
  private textElement: HTMLElement;
  private _value: number | string;

  constructor(private numberService: NumberService) {
  }

  public valueChanged(): void {
    if ((this.value === undefined) || (this.value === null)) {
      this.text = this.defaultText;
      return;
    }

    this._value = this.value;

    let text = null;

    if ((this._value !== null) && (this._value !== undefined)) {
      const average = (this.average === undefined) ? true : Utils.toBoolean(this.average);
      const thousandSeparated = (this.thousandsSeparated === undefined) ? false : Utils.toBoolean(this.thousandsSeparated);
      text = this.numberService.toString(Number(this._value),
        {
          precision: this.precision ? this.precision : (average ? 3 : undefined),
          average,
          mantissa: this.mantissa !== undefined ? this.mantissa : undefined,
          thousandSeparated
        },
      );
    }

    this.text = text ?? this.defaultText;

    this.setTooltip();
  }

  public attached(): void {
    this.setTooltip();
  }

  // public detached(): void {
  //   tippy(this.textElement, "dispose");
  // }

  @computedFrom("_value")
  private get tooltip():string {
    return this._value?.toString(10);
  }

  private setTooltip() {
    if (this.textElement && this.value) {
      // tippy(this.textElement, "dispose");
      const instance = tippy(this.textElement, {
        appendTo: () => document.body, // because is "interactive" and otherwise messes with the layout on hover
        zIndex: 10001,
      });
      instance.setContent(this.value.toString());
    }
  }
}
