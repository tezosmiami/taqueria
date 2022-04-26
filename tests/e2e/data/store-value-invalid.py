# Store Value - Example for illustrative purposes only.

import smartpy as sp

class StoreValue(sp.Contract):
    def __init__(self, value):
        self.init(storedValue = value)

    @sp.entry_point
    def replace(self, params):
        self.data.storedValue = params.value

    @sp.entry_point
    def double(self):
        self.data.storedValue *= 2

    @sp.entry_point
    def divide(self, params):
        sp.verify(params.divisor > 5) 
        sdfsafda
        self.data.storedValue /= params.divisor

if "templates" not in __name__:
    @sp.add_test(name = "StoreValue")
    def test():
        c1 = StoreValue(12)
        scenario = sp.test_scenario()
        scenario.h1("Store Value")
        scenario += c1
        c1.replace(value = 15)
        scenario.p("Some computation").show(c1.data.storedValue * 12)
        c1.replace(value = 25)
        c1.double()
        c1.divide(divisor = 2).run(valid = False, exception="WrongCondition: params.divisor > 5")
        scenario.verify(c1.data.storedValue == 50)
        c1.divide(divisor = 6)
        scenario.verify(c1.data.storedValue == 8)
    dsfasdfasdf
    sp.add_compilation_target("storeValue", StoreValue(12))